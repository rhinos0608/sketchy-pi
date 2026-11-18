import { describe, expect, it } from "vitest";
import { registerShowcaseActivation } from "../pi/activation.js";

type PromptOptions = {
  selectedTools: string[];
  skills: { name: string; description: string }[];
};

function mockPi(browser?: { onEnable: () => Promise<string>; onView: () => Promise<string> }) {
  const events = new Map<string, (...args: any[]) => void>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  let active = ["read", "bash", "edit"];
  const messages: string[] = [];
  const notifications: string[] = [];
  const ctx = { hasUI: true, ui: { notify: (text: string) => notifications.push(text) } };
  const pi = {
    on: (name: string, handler: (...args: any[]) => void) => events.set(name, handler),
    registerCommand: (name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) => commands.set(name, command),
    getAllTools: () => ["read", "bash", "edit", "showcase"].map(name => ({ name })),
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => { active = [...names]; },
    sendUserMessage: (message: string) => { messages.push(message); },
  };
  registerShowcaseActivation(pi as any, browser);
  function prompt(): PromptOptions {
    const systemPromptOptions: PromptOptions = {
      selectedTools: ["read", "bash", "showcase", "edit"],
      skills: [
        { name: "showcase", description: "long showcase metadata" },
        { name: "showcase-repo", description: "repo metadata" },
        { name: "showcase-circuit", description: "circuit metadata" },
        { name: "other-skill", description: "keep this" },
      ],
    };
    events.get("before_agent_start")!({ systemPromptOptions });
    return systemPromptOptions;
  }
  const command = (args: string) => commands.get("showcase")!.handler(args, ctx);
  return { events, pi, messages, notifications, prompt, command };
}

describe("persistent-on-demand Showcase context gating", () => {
  it("is absent from normal tool declarations and skill descriptions", () => {
    const { events, pi, prompt } = mockPi();
    pi.setActiveTools(["read", "bash", "edit", "showcase"]);
    events.get("session_start")!();
    expect(pi.getActiveTools()).toEqual(["read", "bash", "edit"]);
    const options = prompt();
    expect(options.selectedTools).toEqual(["read", "bash", "edit"]);
    expect(options.skills.map((skill) => skill.name)).toEqual(["other-skill"]);
  });

  it("stays callable across MULTIPLE agent turns after /showcase", async () => {
    const { events, pi, prompt, command } = mockPi();
    await command("on");
    for (let i = 0; i < 4; i++) {
      const options = prompt();
      expect(options.selectedTools).toContain("showcase");
      expect(options.skills.map((s) => s.name)).toEqual(["showcase", "other-skill"]);
      expect(pi.getActiveTools()).toContain("showcase");
      events.get("agent_end")?.();
      expect(pi.getActiveTools()).toContain("showcase");
    }
  });

  it("/showcase <request> sends a prompt without deactivating afterwards", async () => {
    const { events, pi, messages, prompt, command } = mockPi();
    await command("draw an API flow");
    expect(messages).toEqual(["Use the native showcase tool for this request: draw an API flow"]);
    expect(prompt().selectedTools).toContain("showcase");
    events.get("agent_end")?.();
    expect(prompt().selectedTools).toContain("showcase");
    expect(pi.getActiveTools()).toContain("showcase");
  });

  it("/showcase off hides tool and skills on subsequent turns", async () => {
    const { events, pi, prompt, command } = mockPi();
    await command("");
    events.get("agent_end")?.();
    await command("off");
    expect(pi.getActiveTools()).not.toContain("showcase");
    // Simulates tools-manager adding every registered tool again before a turn.
    pi.setActiveTools(["read", "bash", "edit", "showcase"]);
    expect(prompt().selectedTools).not.toContain("showcase");
    expect(prompt().skills.map((skill) => skill.name)).toEqual(["other-skill"]);
    expect(pi.getActiveTools()).not.toContain("showcase");
  });

  it("session changes reset opt-in, while status is non-mutating", async () => {
    const { events, pi, prompt, command, notifications } = mockPi();
    await command("on");
    await command("status");
    expect(notifications.at(-1)).toContain("active in model context");
    events.get("session_start")!();
    expect(pi.getActiveTools()).not.toContain("showcase");
    expect(prompt().selectedTools).not.toContain("showcase");
    await command("status");
    expect(notifications.at(-1)).toContain("inactive (no model schema)");
  });

  it("opens the browser on activation and reopens it on explicit /showcase view", async () => {
    const opens: string[] = [];
    const { command, messages, pi } = mockPi({
      onEnable: async () => { opens.push("initial"); return "http://127.0.0.1:12345"; },
      onView: async () => { opens.push("again"); return "http://127.0.0.1:12345"; },
    });
    await command("");
    expect(opens).toEqual(["initial"]);
    await command("view");
    expect(opens).toEqual(["initial", "again"]);
    expect(messages).toEqual([]);
    expect(pi.getActiveTools()).toContain("showcase");
  });

  it("reconciles an aggressive tools-manager without disabling other tools", async () => {
    const { pi, prompt, command } = mockPi();
    pi.setActiveTools(["read", "bash", "edit", "showcase", "grep"]);
    expect(prompt().selectedTools).not.toContain("showcase");
    expect(pi.getActiveTools()).toContain("grep");
    await command("on");
    pi.setActiveTools(["read", "bash", "edit", "grep"]);
    expect(prompt().selectedTools).toContain("showcase");
    expect(pi.getActiveTools()).toContain("grep");
  });
});
