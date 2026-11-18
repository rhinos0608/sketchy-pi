import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import sharp from "sharp";
import type { Region } from "../scene/types.js";
import { type ModelTier } from "./models.js";
import { ensureMlxPython, modelPath, prepareMlxModel, visionBinary, WORKER } from "./mlx-runtime.js";

export type LocateMethod = "text" | "grounding" | "detection";
export type LocatedRegion = { name: string; region: Region; method: LocateMethod };
export type LocateResult = { found: LocatedRegion[]; missing: string[] };
export type ProgressEvent = { file?: string; loaded?: number; total?: number; status: string };
type Box = [number, number, number, number];
type WorkerReply = {
  id?: number;
  ready?: boolean;
  error?: string;
  raw?: string;
  parsed?: { bboxes?: number[][]; quad_boxes?: number[][]; labels?: string[] } | null;
};
type Pending = { resolve: (value: WorkerReply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };
const MAX_AREA_SHARE = 0.45;
const workerPool = new Map<string, Promise<Grounder>>();

/** Persistent Apple MLX Florence-2 process. No Transformers.js/ONNX runtime. */
export class Grounder {
  private child: ChildProcessWithoutNullStreams | undefined;
  private pending = new Map<number, Pending>();
  private nextId = 0;
  private stderr = "";
  private booted = false;

  private constructor(readonly tier: ModelTier, private readonly dataDir: string) {}

  static prepare(tier: ModelTier, dataDir: string, onProgress?: (event: ProgressEvent) => void): Promise<void> {
    return prepareMlxModel(tier, dataDir, onProgress);
  }

  static load(tier: ModelTier, dataDir: string): Promise<Grounder> {
    const key = dataDir + "::" + tier;
    let pending = workerPool.get(key);
    if (!pending) {
      pending = (async () => {
        await Grounder.prepare(tier, dataDir);
        const grounder = new Grounder(tier, dataDir);
        await grounder.boot();
        return grounder;
      })().catch((error: unknown) => {
        workerPool.delete(key);
        throw error;
      });
      workerPool.set(key, pending);
    }
    return pending;
  }

  private async boot(): Promise<void> {
    const python = await ensureMlxPython(this.dataDir);
    const child = spawn(python, [WORKER, "serve", modelPath(this.tier, this.dataDir)], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, SKETCHY_VISION_OCR: visionBinary(this.dataDir) },
    });
    this.child = child;
    child.stderr.on("data", (data: Buffer) => {
      this.stderr = (this.stderr + data.toString()).slice(-6000);
    });
    const lines = createInterface({ input: child.stdout });
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) { settled = true; child.kill(); reject(new Error("MLX model load timed out. " + this.stderr)); }
      }, 180_000);
      lines.on("line", (line) => {
        let message: WorkerReply;
        try { message = JSON.parse(line) as WorkerReply; }
        catch { this.stderr = (this.stderr + "\nUnexpected worker output: " + line).slice(-6000); return; }
        if (!this.booted) {
          if (message.ready) {
            this.booted = true;
            if (!settled) { settled = true; clearTimeout(timer); resolve(); }
          } else if (message.error && !settled) {
            settled = true; clearTimeout(timer); reject(new Error(message.error));
          }
          return;
        }
        if (typeof message.id !== "number") return;
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error("MLX inference: " + message.error));
        else pending.resolve(message);
      });
      child.once("error", (error) => {
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
      });
      child.once("exit", (code) => {
        const error = new Error("MLX photo worker exited (" + code + "). " + this.stderr);
        if (!settled) { settled = true; clearTimeout(timer); reject(error); }
        for (const [, pending] of this.pending) {
          clearTimeout(pending.timer); pending.reject(error);
        }
        this.pending.clear();
        this.child = undefined;
        this.booted = false;
        workerPool.delete(this.dataDir + "::" + this.tier);
      });
    });
  }

  private run(image: string, task: string, phrase = ""): Promise<WorkerReply> {
    if (!this.child || !this.booted) throw new Error("MLX photo worker is not running.");
    const id = ++this.nextId;
    return new Promise<WorkerReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("MLX inference timed out. " + this.stderr));
      }, 180_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(JSON.stringify({ id, image, task, phrase }) + "\n", (error) => {
        if (!error) return;
        clearTimeout(timer); this.pending.delete(id); reject(error);
      });
    });
  }

  async locate(imagePath: string, queries: string[]): Promise<LocateResult> {
    const meta = await sharp(imagePath).metadata();
    const size: [number, number] = [meta.width ?? 0, meta.height ?? 0];
    if (!size[0] || !size[1]) throw new Error("Could not read photo dimensions.");
    const valid = (b: Box) => {
      const share = ((b[2] - b[0]) * (b[3] - b[1])) / (size[0] * size[1]);
      return b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1] &&
        b[0] >= 0 && b[1] >= 0 && b[2] <= size[0] && b[3] <= size[1] &&
        share <= MAX_AREA_SHARE;
    };
    const ocrResponse = await this.run(imagePath, "<OCR_WITH_REGION>");
    const ocrData = ocrResponse.parsed;
    const ocr = (ocrData?.labels ?? []).flatMap((text, i) => {
      const q = ocrData?.quad_boxes?.[i];
      if (!q || q.length !== 8) return [];
      const xs = [q[0], q[2], q[4], q[6]] as number[];
      const ys = [q[1], q[3], q[5], q[7]] as number[];
      const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      return valid(box) ? [{ text, box }] : [];
    });
    const found: LocatedRegion[] = [];
    const missing: string[] = [];
    for (const name of queries) {
      const text = matchText(name, ocr);
      if (text) { found.push({ name, region: toRegion(text), method: "text" }); continue; }
      const grounding = await this.run(imagePath, "<CAPTION_TO_PHRASE_GROUNDING>", name);
      const boxes = grounding.parsed?.bboxes?.length
        ? grounding.parsed.bboxes as Box[] : parseLocBoxes(grounding.raw ?? "", size);
      const grounded = boxes.find(valid);
      if (grounded) { found.push({ name, region: toRegion(grounded), method: "grounding" }); continue; }
      const detection = await this.run(imagePath, "<OPEN_VOCABULARY_DETECTION>", name);
      const detected = (detection.parsed?.bboxes?.length
        ? detection.parsed.bboxes as Box[]
        : (detection.raw?.includes("<poly>") ? [] : parseLocBoxes(detection.raw ?? "", size))).find(valid);
      if (detected) { found.push({ name, region: toRegion(detected), method: "detection" }); continue; }
      missing.push(name);
    }
    return { found, missing };
  }
}

export function parseLocBoxes(text: string, [width, height]: [number, number]): Box[] {
  const values = [...text.matchAll(/<loc_(\d+)>/g)].map((m) => Number(m[1]));
  const boxes: Box[] = [];
  for (let i = 0; i + 3 < values.length; i += 4) {
    const [x1, y1, x2, y2] = values.slice(i, i + 4) as [number, number, number, number];
    boxes.push([
      ((x1 + 0.5) / 1000) * width,
      ((y1 + 0.5) / 1000) * height,
      ((x2 + 0.5) / 1000) * width,
      ((y2 + 0.5) / 1000) * height,
    ]);
  }
  return boxes;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export function matchText(query: string, lines: { text: string; box: Box }[]): Box | undefined {
  const q = normalize(query);
  if (q.length < 2) return undefined;
  const exact = lines.find((l) => normalize(l.text) === q);
  if (exact) return exact.box;
  const tokenMatch = lines.find((l) =>
    l.text.split(/[\s,.;:/()-]+/).map(normalize).includes(q),
  );
  return tokenMatch?.box;
}

function toRegion([x1, y1, x2, y2]: Box): Region {
  const r = (n: number) => Math.round(n * 10) / 10;
  return { x: r(x1), y: r(y1), width: r(x2 - x1), height: r(y2 - y1) };
}
