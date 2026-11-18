import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TOOL = "showcase";
const SKILLS = new Set(["showcase", "showcase-repo", "showcase-circuit"]);

/**
 * Declare Sketchy's schema only for a user-requested Showcase turn.
 * An inactive *direct* tool is absent from Pi's LLM tool declarations, not
 * merely rejected by its executor. The skill index is filtered as well.
 */
export function registerShowcaseActivation(pi: ExtensionAPI): void {
  let armed = false;

  function syncTool(): void {
    const current = pi.getActiveTools();
    const next = current.filter((name) => name !== TOOL);
    if (armed) next.push(TOOL);
    if (current.length !== next.length || current.some((name, index) => name !== next[index])) {
      pi.setActiveTools(next);
    }
  }

  pi.on("session_start", () => {
    armed = false;
    syncTool();
  });

  pi.on("before_agent_start", (event) => {
    // Other extensions (including a tool manager) may have refreshed the list.
    // Fix both the live LLM loadout and this request's constructed prompt.
    syncTool();
    const options = event.systemPromptOptions;
    const visible = armed && pi.getActiveTools().includes(TOOL);
    options.selectedTools = [
      ...options.selectedTools.filter((name) => name !== TOOL),
      ...(visible ? [TOOL] : []),
    ];
    if (!visible) {
      options.skills = options.skills.filter((skill) => !SKILLS.has(skill.name));
    }
  });

  pi.on("agent_end", () => {
    armed = false;
    syncTool();
  });

  pi.registerCommand("showcase", {
    description: "Enable native Showcase for one agent turn; /showcase <request> draws immediately",
    handler: async (args, ctx) => {
      const request = args.trim();
      if (request === "off") {
        armed = false;
        syncTool();
        if (ctx.hasUI) ctx.ui.notify("Showcase disabled.", "info");
        return;
      }
      armed = true;
      syncTool();
      if (!pi.getActiveTools().includes(TOOL)) {
        armed = false;
        if (ctx.hasUI) ctx.ui.notify("Showcase is excluded by Pi's active tool restrictions.", "warning");
        return;
      }
      if (request && request !== "on") {
        pi.sendUserMessage("Use the native showcase tool for this request: " + request);
      } else if (ctx.hasUI) {
        ctx.ui.notify("Showcase armed for the next prompt only.", "info");
      }
    },
  });
}
