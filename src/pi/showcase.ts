import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { figureIssues } from "../figures/index.js";
import { suggestIcons } from "../icons.js";
import { layoutScene, previousLayout, type PreviousLayout } from "../layout/index.js";
import { parseEditor } from "../layout/links.js";
import { PartIndex } from "../parts/index.js";
import { MODELS, isModelTier, unavailableReason } from "../photos/models.js";
import { PhotoService } from "../photos/service.js";
import { SceneBuilder, SceneError } from "../scene/builder.js";
import { parseCompact, type CompactScene } from "../scene/compact.js";
import { fillScene } from "../scene/fill.js";
import { applyPatch } from "../scene/patch.js";
import { standaloneFiles } from "../standalone.js";
import { LocalDatabase, defaultDataDir } from "../storage/database.js";
import { terminalFiles } from "../terminal.js";
import { edgeShape, groupShape, labelShape, nodeShape, partShape, sceneMetaShape, sketchShape, stepShape, wireShape } from "../tools/schemas.js";

export const ACTIONS = ["sketch", "edit_sketch", "render", "new_scene", "add_box", "add_node", "add_text", "add_group", "add_arrow", "add_edge", "place_part", "connect", "label", "add_step", "add_image", "search_parts", "search_icons", "find_image", "locate", "choose_model", "download_model", "model_status"] as const;
export type ShowcaseAction = (typeof ACTIONS)[number];
export type ShowcaseInput = {
  action: ShowcaseAction;
  scene?: string;
  changes?: string;
  query?: string;
  payload?: Record<string, unknown>;
  image?: string;
  queries?: string[];
  min_width?: number;
  tier?: "small" | "medium" | "large";
  open?: boolean;
};
export type ShowcaseResult = {
  action: ShowcaseAction;
  text: string;
  page?: string;
  preview?: string;
  previewMime?: "image/png" | "image/jpeg";
  images?: string[];
  issues?: string[];
};

function needed(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new SceneError("Missing " + field + ".");
  return value;
}
function parse<T extends z.ZodRawShape>(shape: T, data: unknown): z.infer<z.ZodObject<T>> {
  return z.object(shape).parse(data);
}

/** Native Sketchy controller. Deliberately does not import MCP transport or server modules. */
export class ShowcaseCore {
  private parts?: PartIndex;
  private builder?: SceneBuilder;
  private lastCompact?: CompactScene;
  private lastLayout?: PreviousLayout;
  private photos?: PhotoService;
  private dataDir: string;
  private openDefault: boolean;

  constructor(config: { dataDir?: string; openDefault?: boolean } = {}) {
    this.dataDir = config.dataDir ?? defaultDataDir();
    this.openDefault = config.openDefault ?? false;
  }

  private async getBuilder(): Promise<SceneBuilder> {
    this.parts ??= await PartIndex.load();
    this.builder ??= new SceneBuilder(this.parts);
    return this.builder;
  }

  private async photoService(): Promise<PhotoService> {
    if (process.env.SKETCHY_PHOTOS === "off") throw new SceneError("Photo tools disabled by SKETCHY_PHOTOS=off.");
    this.photos ??= new PhotoService(await LocalDatabase.open(this.dataDir), this.dataDir);
    return this.photos;
  }

  async run(input: ShowcaseInput): Promise<ShowcaseResult> {
    const action = input.action;
    if (!ACTIONS.includes(action)) throw new SceneError("Unknown action: " + action);
    const builder = await this.getBuilder();
    const p = input.payload ?? {};
    const query = input.query ?? p.query;

    switch (action) {
      case "search_parts": {
        const q = needed(query, "query").trim();
        const d = this.parts!.detail(q);
        if (d) {
          const pins = d.pinList.map((pin) => pin.name + (pin.signals.length ? " (" + pin.signals.join(", ") + ")" : "")).join(", ");
          return { action, text: d.title + " [" + d.type + "], " + d.category + "\nPins: " + (pins || "none") +
            (d.variants.length ? "\nVariants: " + d.variants.join(", ") : "") };
        }
        const found = this.parts!.search(q);
        return { action, text: found.length ? found.map((item) => item.type + " — " + item.title + " (" + item.category + ", " + item.pins + " pins)").join("\n") : "No parts match " + q };
      }
      case "search_icons": return { action, text: suggestIcons(needed(query, "query"), 15).join("\n") || "No icons match." };
      case "find_image": {
        const found = await (await this.photoService()).find(needed(query, "query"), input.min_width);
        return { action, text: found.length ? found.map((c) => c.id + " — " + c.title + " by " + c.author + " (" + c.license + ", " + c.width + "x" + c.height + ", " + c.provider + ")\n" + c.sourceUrl).join("\n") : "No freely licensed photos found." };
      }
      case "locate": {
        const service = await this.photoService();
        const id = needed(input.image ?? p.image, "image");
        const queries = input.queries ?? p.queries;
        if (!Array.isArray(queries) || queries.length < 1 || queries.length > 12 || queries.some((q) => typeof q !== "string" || !q.trim()))
          throw new SceneError("locate expects 1–12 queries.");
        const found = await service.locate(id, queries as string[]);
        builder.updateImageRegions(id, service.regions(id));
        const text = [...found.found.map((f) => f.name + ": found (" + f.method + ")"), ...found.missing.map((m) => m + ": missing")].join("\n");
        if (!found.found.length) return { action, text };
        const dir = join(this.dataDir, "exports");
        await mkdir(dir, { recursive: true });
        const preview = join(dir, "locate-" + id + "-" + Date.now() + ".jpg");
        await writeFile(preview, Buffer.from(await service.annotate(id, found.found), "base64"));
        return { action, text: text + "\nPreview: " + preview, preview, previewMime: "image/jpeg" };
      }
      case "model_status": return { action, text: JSON.stringify((await this.photoService()).modelState()) };
      case "choose_model": {
        const state = (await this.photoService()).modelState();
        const choices = Object.values(MODELS).map((m) => m.tier + ": " + m.downloadMb + " MB, ~" + m.ramGb + " GB RAM — " + m.quality + (unavailableReason(m.tier) ? " (unavailable)" : ""));
        return { action, text: "Current: " + JSON.stringify(state) + "\n" + choices.join("\n") };
      }
      case "download_model": {
        const tier = input.tier ?? p.tier;
        if (!isModelTier(tier)) throw new SceneError("tier must be small, medium or large.");
        return { action, text: JSON.stringify((await this.photoService()).startDownload(tier)) };
      }
      case "add_image": {
        const service = await this.photoService();
        const id = needed(input.image ?? p.image, "image");
        builder.addImage(await service.sceneImage(id, typeof p.caption === "string" ? p.caption : undefined));
        this.lastCompact = undefined;
        return { action, text: "Added image " + id + ". Call render." };
      }
      case "sketch":
      case "edit_sketch": {
        if (action === "edit_sketch" && !this.lastCompact) throw new SceneError("No compact scene to edit. Call sketch with scene first.");
        const compact = action === "edit_sketch"
          ? applyPatch(this.lastCompact!, needed(input.changes, "changes"))
          : input.scene === undefined ? undefined : parseCompact(input.scene);
        if (!compact && !input.payload) throw new SceneError("sketch needs scene (compact lines) or payload (JSON scene).");
        const candidate = new SceneBuilder(this.parts!);
        await fillScene(candidate, compact ?? parse(sketchShape, p), (id) => this.photoService().then((s) => s.sceneImage(id)));
        if (candidate.isEmpty()) throw new SceneError("Empty scene.");
        const output = await this.render(candidate, input.open);
        this.builder = candidate;
        this.lastCompact = compact;
        return { ...output, action };
      }
      case "render": return { ...(await this.render(builder, input.open)), action };
      case "new_scene":
        builder.reset(parse(sceneMetaShape, p));
        this.lastCompact = undefined;
        this.lastLayout = undefined;
        return { action, text: "Started a new scene. Add elements and render." };
      default: return this.add(action, builder, p);
    }
  }

  private add(action: ShowcaseAction, b: SceneBuilder, p: Record<string, unknown>): ShowcaseResult {
    let description = "";
    switch (action) {
      case "add_box":
      case "add_node": {
        const x = parse(nodeShape, p); b.addNode(x); description = "Added node " + x.id; break;
      }
      case "add_text": {
        const x = z.object({ id: z.string(), text: z.string(), group: z.string().optional() }).parse(p);
        b.addNode({ id: x.id, label: x.text, group: x.group, shape: "text" });
        description = "Added text " + x.id; break;
      }
      case "add_group": {
        const x = parse(groupShape, p); b.addGroup(x); description = "Added group " + x.id; break;
      }
      case "add_arrow":
      case "add_edge": {
        description = "Added edge " + b.addEdge(parse(edgeShape, p)); break;
      }
      case "place_part": {
        const x = parse(partShape, p); b.addPart(x);
        description = "Placed " + x.type + " " + x.id + ". Pins: " + this.parts!.pins(x.type).map((v) => v.name).join(", ");
        break;
      }
      case "connect": description = "Connected " + b.connect(parse(wireShape, p)); break;
      case "label": description = "Added label " + b.addLabel(parse(labelShape, p)); break;
      case "add_step": description = "Added step " + b.addStep(parse(stepShape, p)); break;
      default: throw new SceneError("Unsupported action " + action);
    }
    this.lastCompact = undefined;
    return { action, text: description + ". Call render when ready." };
  }

  private async render(b: SceneBuilder, open?: boolean): Promise<ShowcaseResult> {
    if (b.isEmpty()) throw new SceneError("Empty scene. Add nodes, parts, figures or images first.");
    const layout = await layoutScene(b.scene, this.parts!, {
      editor: parseEditor(process.env.SKETCHY_EDITOR),
      previous: this.lastLayout,
    });
    const data = await terminalFiles(join(this.dataDir, "pi-terminal"),
      standaloneFiles(join(this.dataDir, "exports"), open ?? this.openDefault))(layout);
    this.lastLayout = previousLayout(layout);
    const s = b.scene;
    const counts = [
      [s.nodes.length, "nodes"], [s.edges.length, "edges"], [s.groups.length, "groups"],
      [s.parts.length, "parts"], [s.wires.length, "wires"], [s.labels.length, "labels"],
      [s.images.length, "images"], [s.figures.length, "figures"], [s.steps.length, "steps"],
    ] as const;
    const summary = counts.filter(([n]) => n > 0).map(([n, name]) => n + " " + name).join(", ");
    const issues = figureIssues(s.figures, s.steps).slice(0, 6);
    const text = "Rendered " + (s.title ? JSON.stringify(s.title) + " " : "") + "(" + summary + ").\n" +
      (data.page ? "Interactive page: " + data.page + "\n" : "") +
      (data.images[0] ? "PNG preview: " + data.images[0] + "\n" : "") +
      (issues.length ? "Sketchy noticed: " + issues.join("; ") + "\n" : "") +
      "The user can see the drawing; explain it briefly.";
    return { action: "render", text, page: data.page, preview: data.images[0], previewMime: "image/png", images: data.images, issues };
  }
}
