import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { MODELS, type ModelTier } from "./models.js";
import type { ProgressEvent } from "./grounding.js";

const exec = promisify(execFile);
export const WORKER = fileURLToPath(new URL("../../python/mlx_worker.py", import.meta.url));
const SWIFT_OCR = fileURLToPath(new URL("../../python/vision_ocr.swift", import.meta.url));
export function visionBinary(dataDir: string): string { return join(dataDir, "mlx", "vision-ocr"); }
const runtimePromises = new Map<string, Promise<string>>();

export function modelPath(tier: ModelTier, dataDir: string): string {
  return join(dataDir, "models", MODELS[tier].repo.split("/")[1]!);
}

/** Check every indexed shard, not merely the index: interrupted downloads stay unready. */
export function modelFilesExist(tier: ModelTier, dataDir: string): boolean {
  const dir = modelPath(tier, dataDir);
  const index = join(dir, "model.safetensors.index.json");
  try {
    if (existsSync(index)) {
      const map = JSON.parse(readFileSync(index, "utf8")) as { weight_map?: Record<string, string> };
      const files = new Set(Object.values(map.weight_map ?? {}));
      return files.size > 0 && [...files].every((file) => existsSync(join(dir, file)) && statSync(join(dir, file)).size > 0);
    }
    return readdirSync(dir).some((file) => file.endsWith(".safetensors") && statSync(join(dir, file)).size > 0);
  } catch {
    return false;
  }
}

export async function ensureMlxPython(dataDir: string): Promise<string> {
  if (process.platform !== "darwin" || process.arch !== "arm64") {
    throw new Error("MLX photo labeling requires an Apple Silicon Mac.");
  }
  const root = join(dataDir, "mlx");
  let pending = runtimePromises.get(root);
  if (!pending) {
    pending = installPython(root).catch((err: unknown) => {
      runtimePromises.delete(root);
      throw err;
    });
    runtimePromises.set(root, pending);
  }
  return pending;
}

async function installPython(root: string): Promise<string> {
  const python = join(root, "venv", "bin", "python");
  mkdirSync(root, { recursive: true });
  if (!existsSync(python)) {
    let selected: string | undefined;
    const candidates = [
      process.env.SKETCHY_PYTHON,
      "/opt/homebrew/bin/python3.12", "python3.12", "python3.13", "python3.11", "python3",
    ].filter((v): v is string => Boolean(v));
    for (const candidate of candidates) {
      try {
        const { stdout } = await exec(candidate, ["-c", "import sys; assert (3, 11) <= sys.version_info[:2] < (3, 15); print(sys.executable)"], { timeout: 10_000 });
        selected = stdout.trim();
        break;
      } catch { /* try another Python */ }
    }
    if (!selected) throw new Error("Python 3.11–3.14 is required for MLX. Install Python 3.12 or set SKETCHY_PYTHON.");
    await exec(selected, ["-m", "venv", join(root, "venv")], { timeout: 120_000 });
  }
  try {
    await exec(python, ["-c", "import mlx_vlm, huggingface_hub"], { timeout: 30_000 });
  } catch {
    await exec(python, ["-m", "pip", "install", "-q", "mlx-vlm>=0.8.0", "huggingface_hub"], {
      timeout: 20 * 60_000, maxBuffer: 2 * 1024 * 1024,
    });
  }
  const nativeOcr = join(root, "vision-ocr");
  if (!existsSync(nativeOcr)) {
    try {
      await exec("swiftc", ["-O", "-o", nativeOcr, SWIFT_OCR], { timeout: 120_000 });
    } catch (error) {
      console.warn("sketchy: Apple Vision OCR unavailable; using Florence OCR", error);
    }
  }
  return python;
}

function folderBytes(dir: string): number {
  try {
    return readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return total + folderBytes(path);
      return total + (entry.isFile() ? statSync(path).size : 0);
    }, 0);
  } catch { return 0; }
}

export async function prepareMlxModel(tier: ModelTier, dataDir: string, onProgress?: (event: ProgressEvent) => void): Promise<void> {
  const python = await ensureMlxPython(dataDir);
  const dir = modelPath(tier, dataDir);
  if (modelFilesExist(tier, dataDir)) return;
  mkdirSync(dir, { recursive: true });
  const expected = MODELS[tier].downloadMb * 1024 * 1024;
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(python, [WORKER, "download", MODELS[tier].repo, dir], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    let stdout = "";
    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4000); });
    const timer = setInterval(() => onProgress?.({
      file: "weights", loaded: Math.min(expected * 0.99, folderBytes(dir)), total: expected, status: "progress",
    }), 1000);
    child.on("error", (error) => { clearInterval(timer); reject(error); });
    child.on("exit", (code) => {
      clearInterval(timer);
      if (code === 0 && modelFilesExist(tier, dataDir)) resolve();
      else reject(new Error("MLX model download failed: " + (stderr || stdout || "exit code " + code)));
    });
  });
}
