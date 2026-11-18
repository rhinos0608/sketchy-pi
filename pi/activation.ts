import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const TOOL = "showcase";
const PRIMARY_SKILL = "showcase";
const EXPLICIT_SKILLS = new Set(["showcase-repo", "showcase-circuit"]);

/**
 * Opt-in for the duration of the Pi session, not for just one agent turn.
 * Only active direct tools are declared to the model. A registered but inactive
 * direct tool cannot be discovered by tool_search (which indexes deferred tools).
 */
export function registerShowcaseActivation(
  pi: ExtensionAPI,
  browser?: { onEnable: () => Promise<string>; onView: () => Promise<string> },
): void {
  let enabled = false;

  function syncTool(): boolean {
    // /tools and other extensions can reconfigure the complete active set.
    // Preserve every other tool; only change Showcase's presence.
    const current = pi.getActiveTools();
    const alreadyActive = current.includes(TOOL);
    // Do not rebuild the prompt or reorder tools when the desired state already holds.
    if (alreadyActive !== enabled) {
      pi.setActiveTools(enabled ? [...current, TOOL] : current.filter((name) => name !== TOOL));
    }
    return pi.getActiveTools().includes(TOOL);
  }

  pi.on("session_start", () => {
    // A new session is opt-in again; agent_end must NOT revoke the opt-in.
    enabled = false;
    syncTool();
  });

  pi.on("before_agent_start", (event) => {
    // Pi's /tools manager may reactivate every registered tool on each turn.
    // Reconcile after it, and edit the prompt for this specific request as well.
    const active = syncTool();
    const options = event.systemPromptOptions;
    const shouldDeclare = enabled && active;
    const isDeclared = options.selectedTools.includes(TOOL);
    if (shouldDeclare && !isDeclared) {
      options.selectedTools = [...options.selectedTools, TOOL];
    } else if (!shouldDeclare && isDeclared) {
      options.selectedTools = options.selectedTools.filter((name) => name !== TOOL);
    }
    // Specialist skills remain usable via /skill:name, but never enter the
    // model skill index. Keep only the main Showcase metadata when enabled.
    options.skills = options.skills.filter((skill) =>
      !EXPLICIT_SKILLS.has(skill.name) && (shouldDeclare || skill.name !== PRIMARY_SKILL),
    );
  });

  pi.registerCommand("showcase", {
    description: "Enable Showcase and its live browser workspace; /showcase view reopens, /showcase off disables",
    handler: async (args, ctx) => {
      const request = args.trim();
      if (request === "status") {
        const registered = pi.getAllTools().some((tool) => tool.name === TOOL);
        const declared = syncTool();
        if (ctx.hasUI) ctx.ui.notify(
          `Showcase: ${registered ? "registered" : "missing"}, ${enabled && declared ? "active in model context" : "inactive (no model schema)"}. ${enabled ? "Use /showcase off to disable." : "Use /showcase to enable."}`,
          "info",
        );
        return;
      }
      if (request === "off") {
        enabled = false;
        syncTool();
        if (ctx.hasUI) ctx.ui.notify("Showcase disabled; schema excluded from new agent turns.", "info");
        return;
      }
      enabled = true;
      if (!syncTool()) {
        enabled = false;
        if (ctx.hasUI) ctx.ui.notify("Showcase could not be enabled; check Pi's tool allowlist.", "warning");
        return;
      }
      try {
        const url = request === "view" ? await browser?.onView() : await browser?.onEnable();
        if (request === "view") {
          if (ctx.hasUI) ctx.ui.notify(url ? "Live Showcase: " + url : "Live viewer unavailable.", "info");
        } else if (request && request !== "on") {
          pi.sendUserMessage("Use the native showcase tool for this request: " + request);
        } else if (ctx.hasUI) {
          ctx.ui.notify("Showcase enabled for this session. Live workspace: " + (url ?? "unavailable"), "info");
        }
      } catch (error) {
        if (ctx.hasUI) ctx.ui.notify("Showcase enabled, but browser could not open: " + String(error), "warning");
        if (request && request !== "on" && request !== "view") {
          pi.sendUserMessage("Use the native showcase tool for this request: " + request);
        }
      }
    },
  });
}
