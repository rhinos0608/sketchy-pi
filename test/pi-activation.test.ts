import { describe, expect, it } from "vitest";
import { registerShowcaseActivation } from "../pi/activation.js";

type PromptOptions = {
  selectedTools: string[];
  skills: { name: string; description: string }[];
};

function mockPi() {
  const events = new Map<string, (...args: any[]) => void>();
  const commands = new Map<string, { handler: (args: string, ctx: any) => Promise<void> }>();
  let active = ["read", "bash", "edit"];
  const messages: string[] = [];
  const pi = {
    on: (name: string, handler: (...args: any[]) => void) => events.set(name, handler),
    registerCommand: (name: string, command: { handler: (args: string, ctx: any) => Promise<void> }) => commands.set(name, command),
    getActiveTools: () => [...active],
    setActiveTools: (names: string[]) => { active = [...names]; },
    sendUserMessage: (message: string) => { messages.push(message); },
  };
  registerShowcaseActivation(pi as any);
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
  return { events, commands, pi, messages, prompt };
}

describe("user-triggered Showcase context gating", () => {
  it("hides schema and bundled skills from ordinary model requests", () => {
    const { events, pi, prompt } = mockPi();
    pi.setActiveTools(["read", "bash", "edit", "showcase"]);
    events.get("session_start")!();
    expect(pi.getActiveTools()).toEqual(["read", "bash", "edit"]);
    const options = prompt();
    expect(options.selectedTools).toEqual(["read", "bash", "edit"]);
    expect(options.skills.map((skill) => skill.name)).toEqual(["other-skill"]);
    expect(pi.getActiveTools()).not.toContain("showcase");
  });

  it("/showcase <request> exposes one tool for the requested turn, then removes it", async () => {
    const { events, commands, pi, messages, prompt } = mockPi();
    await commands.get("showcase")!.handler("draw an API flow", { hasUI: false });
    expect(messages).toEqual(["Use the native showcase tool for this request: draw an API flow"]);
    expect(pi.getActiveTools()).toContain("showcase");
    const enabled = prompt();
    expect(enabled.selectedTools).toContain("showcase");
    expect(enabled.skills).toHaveLength(4);
    events.get("agent_end")!();
    expect(pi.getActiveTools()).toEqual(["read", "bash", "edit"]);
    expect(prompt().skills.map((s) => s.name)).toEqual(["other-skill"]);
  });

  it("bare /showcase arms the next prompt; /showcase off and session switches disarm", async () => {
    const { events, commands, pi, prompt } = mockPi();
    await commands.get("showcase")!.handler("", { hasUI: false });
    expect(prompt().selectedTools).toContain("showcase");
    await commands.get("showcase")!.handler("off", { hasUI: false });
    expect(prompt().selectedTools).not.toContain("showcase");
    await commands.get("showcase")!.handler("on", { hasUI: false });
    events.get("session_start")!();
    expect(pi.getActiveTools()).not.toContain("showcase");
  });

  it("removes a later tool-manager reactivation from the live and prompt loadouts", () => {
    const { pi, prompt } = mockPi();
    pi.setActiveTools(["read", "bash", "edit", "showcase"]);
    expect(prompt().selectedTools).not.toContain("showcase");
    expect(pi.getActiveTools()).not.toContain("showcase");
  });
});
