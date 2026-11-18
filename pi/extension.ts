import { existsSync, readFileSync } from "node:fs";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Container, Image, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { ACTIONS, ShowcaseCore, type ShowcaseAction, type ShowcaseInput } from "../dist/pi/showcase.js";

const schema = Type.Object({
  action: StringEnum(ACTIONS, { description: "Sketchy operation (the original MCP operation name)." }),
  scene: Type.Optional(Type.String({ description: "Whole scene in Sketchy's compact line syntax for action=sketch." })),
  changes: Type.Optional(Type.String({ description: "Compact patch syntax for action=edit_sketch; supports remove <id>." })),
  query: Type.Optional(Type.String({ description: "Search query for search_parts, search_icons, find_image." })),
  payload: Type.Optional(Type.Record(Type.String(), Type.Unknown(), { description: "Named arguments from the original operation. For sketch, the JSON scene. For incremental actions, the original MCP tool parameters (id, label, from, to, etc)." })),
  image: Type.Optional(Type.String({ description: "Photo id from find_image for locate/add_image." })),
  queries: Type.Optional(Type.Array(Type.String(), { minItems: 1, maxItems: 12, description: "Photo regions to locate." })),
  min_width: Type.Optional(Type.Integer({ minimum: 1, description: "Minimum photo width for find_image." })),
  tier: Type.Optional(StringEnum(["small", "medium", "large"] as const, { description: "Photo model tier." })),
  open: Type.Optional(Type.Boolean({ description: "Open the interactive HTML page in the browser; the image preview also appears in Pi where supported." })),
});

const description = [
  "Single native Pi tool for Sketchy drawings; NO MCP server or adapter.",
  "Use action=sketch and scene=compact Sketchy lines to draw in one call, then action=edit_sketch with changes for follow-ups.",
  "Or use action=new_scene, add_box/add_node/add_text/add_group/add_arrow/add_edge/place_part/connect/label/add_step/add_image with payload matching the named parameters of each original Sketchy MCP tool, then action=render.",
  "Use action=sketch with payload for the original JSON sketch schema (nodes, edges, groups, parts, wires, labels, steps).",
  "Discovery: search_parts/search_icons/find_image use query; locate uses image+queries; model_status/choose_model/download_model manage local photo labeling.",
  "Pi shows a PNG preview; a standalone interactive HTML page provides hover, steps, sliders and SVG/PNG/Excalidraw export.",
  "Compact example: title Web request\\ndir right\\nbrowser Browser @globe\\napi API @server\\ndb Database (cylinder)\\nbrowser -> api HTTPS\\napi -> db query\\nstep Request: Browser talks to API | browser api browser->api",
].join("\n");

export default function (pi: ExtensionAPI) {
  let core = new ShowcaseCore({ openDefault: process.env.SKETCHY_OPEN === "1" });
  pi.on("session_start", () => {
    core = new ShowcaseCore({ openDefault: process.env.SKETCHY_OPEN === "1" });
  });

  pi.registerTool({
    name: "showcase",
    label: "Showcase",
    description,
    promptSnippet: "Draw, edit and display interactive Sketchy diagrams; one tool for diagrams, parts and photo labeling.",
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
            ["small (280 MB)", "medium (830 MB)", "large (3.1 GB)", "Cancel"]);
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
        args.action === "edit_sketch" ? "edit drawing" : args.action;
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
}
