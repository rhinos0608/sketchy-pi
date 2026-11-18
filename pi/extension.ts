import { existsSync, readFileSync } from "node:fs";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Image, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { registerShowcaseActivation } from "./activation.js";
import { ACTIONS, ShowcaseCore, type ShowcaseAction, type ShowcaseInput } from "../dist/pi/showcase.js";
import { LiveShowcase, type RefineRequest } from "../dist/pi/live.js";

const schema = Type.Object({
  action: StringEnum(ACTIONS, { description: "Native Showcase operation; sketch and edit_sketch publish into the live browser workspace." }),
  scene: Type.Optional(Type.String({ description: "Whole scene in Sketchy's compact line syntax for action=sketch." })),
  changes: Type.Optional(Type.String({ description: "Compact patch syntax for action=edit_sketch; supports remove <id>." })),
  query: Type.Optional(Type.String({ description: "Search query for search_parts, search_icons, find_image." })),
  payload: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "JSON scene for sketch, or named arguments for incremental actions (id, label, from, to, etc)." })),
  image: Type.Optional(Type.String({ description: "Photo id from find_image for locate/add_image." })),
  queries: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: 12, description: "Photo regions to locate." })),
  min_width: Type.Optional(Type.Integer({ minimum: 1, description: "Minimum photo width for find_image." })),
  tier: Type.Optional(StringEnum(["small", "medium", "large"] as const, { description: "Photo model tier." })),
  open: Type.Optional(Type.Boolean({ description: "Open or keep the live localhost workspace in the browser. Sketch edits update that same page automatically." })),

});

const description = [
  "Direct native Pi tool for Sketchy drawings; NO MCP server or adapter. When this tool appears in your callable tools, invoke showcase directly. Pi tool_search only indexes deferred/codemode tools, so it will NEVER find this direct tool.",
  "Use action=sketch and scene=compact Sketchy lines to draw in one call, then action=edit_sketch with changes for follow-ups.",
  "For incremental drawing, use new_scene and add_node/add_edge/add_group/place_part/connect/label/add_step with payload, then action=render to publish the updated browser scene.",
  "Use action=sketch with payload for the original JSON sketch schema (nodes, edges, groups, parts, wires, labels, steps).",
  "Discovery: search_parts/search_icons/find_image use query; locate uses image+queries; model_status/choose_model/download_model manage local photo labeling.",
  "Showcase runs a live localhost browser workspace. Every sketch/edit_sketch/render updates the same page in real time with hover, steps, sliders, annotated feedback, and SVG/PNG/Excalidraw export. The browser can send refinement requests back to this Pi session.",
  "Compact example: title Web request\\ndir right\\nbrowser Browser @globe\\napi API @server\\ndb Database (cylinder)\\nbrowser -> api HTTPS\\napi -> db query\\nstep Request: Browser talks to API | browser api browser->api",
].join("\n");

export default function (pi: ExtensionAPI) {
  function createLive(): LiveShowcase {
    return new LiveShowcase({
      onRefine: async ({ text, image }: RefineRequest) => {
        if (!pi.getActiveTools().includes("showcase")) {
          throw new Error("Showcase is disabled in Pi. Run /showcase to re-enable it.");
        }
        const prompt = "Message from the live Showcase browser for the current drawing: " + text +
          "\nIf the user requests a change, update the existing live browser scene using showcase " +
          "action=edit_sketch for compact scenes, or the appropriate native action for other scenes. " +
          "Keep unrelated elements intact; answer questions normally when no change is requested.";
        if (image) {
          pi.sendUserMessage([
            { type: "text", text: prompt },
            { type: "image", data: image, mimeType: "image/png" },
          ]);
        } else {
          pi.sendUserMessage(prompt);
        }
      },
    });
  }
  let live = createLive();
  let core = new ShowcaseCore({ live, openDefault: process.env.SKETCHY_OPEN !== "0" });
  pi.on("session_start", async () => {
    await live.close();
    live = createLive();
    core = new ShowcaseCore({ live, openDefault: process.env.SKETCHY_OPEN !== "0" });
  });
  pi.on("session_shutdown", async () => { await live.close(); });

  pi.registerTool({
    name: "showcase",
    defaultActive: false,
    executionMode: "sequential",
    label: "Showcase",
    description,
    promptSnippet: "Draw and iteratively refine in the live localhost Showcase browser; sketch/edit_sketch/render update one persistent interactive page.",
    parameters: schema,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (signal?.aborted) return { content: [{ type: "text", text: "Cancelled." }], details: { cancelled: true } };
      try {
        const input = params as ShowcaseInput;

        // Photo model downloads can exceed 3 GB. Never silently start one.
        if (input.action === "download_model" && ctx.hasUI) {
          const ok = await ctx.ui.confirm("Download Sketchy photo model?",
            "Tier: " + (input.tier ?? String(input.payload?.tier ?? "unspecified")) + ". This downloads model files to ~/.sketchy.");
          if (!ok) return { content: [{ type: "text", text: "Model download cancelled." }], details: { cancelled: true } };
        } else if (input.action === "download_model" && !ctx.hasUI) {
          return { content: [{ type: "text", text: "Run this operation in interactive Pi to approve the model download." }], details: { cancelled: true } };
        }

        if (input.action === "choose_model" && !input.tier && ctx.hasUI) {
          const selected = await ctx.ui.select("Choose a local photo-labeling model",
            ["small (~270 MB)", "medium (~900 MB)", "large (~1.9 GB)", "Cancel"]);
          if (selected && selected !== "Cancel") {
            const tier = selected.split(" ")[0] as "small" | "medium" | "large";
            const ok = await ctx.ui.confirm("Download " + tier + " model?", "The model is stored under ~/.sketchy.");
            if (ok) input.action = "download_model", input.tier = tier;
          }
        }

        const result = await core.run(input);
        return {
          content: [{ type: "text", text: result.text }],
          details: {
            action: result.action,
            page: result.page,
            preview: result.preview,
            previewMime: result.previewMime,
            images: result.images,
            issues: result.issues,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { content: [{ type: "text", text: "Sketchy error: " + message }], details: { error: message }, isError: true };
      }
    },
    renderCall(args, theme) {
      const text = args.action === "sketch" ? (args.scene?.split("\n")[0] ?? "draw scene") :
        args.action === "edit_sketch" ? "edit drawing" : String(args.action);
      return new Text(theme.fg("toolTitle", theme.bold("showcase ")) + theme.fg("muted", text), 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      if (isPartial) return new Text(theme.fg("muted", "Drawing..."), 0, 0);
      const details = (result.details ?? {}) as {
        error?: string; page?: string; preview?: string; previewMime?: "image/png" | "image/jpeg"; action?: ShowcaseAction;
      };
      if (details.error) return new Text(theme.fg("error", "Sketchy: " + details.error), 0, 0);
      const container = new Container();
      const firstLine = result.content.find((item) => item.type === "text");
      const text = firstLine && firstLine.type === "text" ? firstLine.text : "";
      container.addChild(new Text(theme.fg("success", text.split("\n")[0] ?? "Done"), 0, 0));
      if (details.page) container.addChild(new Text(theme.fg("muted", "Interactive: " + details.page), 0, 0));
      if (details.preview && context.showImages && existsSync(details.preview)) {
        try {
          const bytes = readFileSync(details.preview).toString("base64");
          container.addChild(new Image(bytes, details.previewMime ?? "image/png",
            { fallbackColor: (s) => theme.fg("muted", s) },
            { maxWidthCells: 65, maxHeightCells: expanded ? 32 : 20, filename: details.preview }));
        } catch {
          container.addChild(new Text(theme.fg("muted", "Preview: " + details.preview), 0, 0));
        }
      } else if (details.preview) container.addChild(new Text(theme.fg("muted", "Preview: " + details.preview), 0, 0));
      if (expanded && !details.page && text.includes("\n"))
        container.addChild(new Text(theme.fg("dim", text.split("\n").slice(1).join("\n")), 0, 0));
      return container;
    },
  });

  registerShowcaseActivation(pi, {
    onEnable: () => process.env.SKETCHY_OPEN === "0" ? live.ensure() : live.open(),
    onView: () => live.open(true),
  });
}
