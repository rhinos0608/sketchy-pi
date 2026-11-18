import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCompact } from "../src/scene/compact.js";
import { ShowcaseCore } from "../src/pi/showcase.js";

const root = new URL("../pi/skills/", import.meta.url);
function read(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, root)), "utf8");
}
function examples(markdown: string): string[] {
  return [...markdown.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1]!);
}

describe("Pi Showcase skill isolation and examples", () => {
  it("only the main skill is automatically invocable", () => {
    const main = read("showcase/SKILL.md");
    const repo = read("showcase-repo/SKILL.md");
    const circuit = read("showcase-circuit/SKILL.md");

    expect(main).toMatch(/^name: showcase$/m);
    expect(main).not.toMatch(/^disable-model-invocation: true$/m);
    expect(repo).toMatch(/^disable-model-invocation: true$/m);
    expect(circuit).toMatch(/^disable-model-invocation: true$/m);
    expect(main).not.toMatch(/Claude|MCP|original Sketchy operations/i);
    expect(repo).not.toMatch(/For each file-backed node include/i);
    expect(repo).toContain("only if the user wants clickable local-editor links");
    expect(main).toContain("Read `references/syntax.md` only when");
  });

  it("all syntax reference and skill diagram examples parse", () => {
    const paths = [
      "showcase/SKILL.md",
      "showcase-repo/SKILL.md",
      "showcase-circuit/SKILL.md",
      "showcase/references/syntax.md",
    ];
    for (const path of paths) {
      for (const scene of examples(read(path))) {
        expect(() => parseCompact(scene), path + "\n" + scene).not.toThrow();
      }
    }
    const ref = read("showcase/references/syntax.md");
    for (const kind of ["plot", "chart", "seq", "array", "list", "stack", "queue", "tree"]) {
      expect(ref).toMatch(new RegExp("\\b" + kind + "\\b"));
    }
  });

  it("renders the circuit skill's resistor-in-series example with all pins connected", async () => {
    const [scene] = examples(read("showcase-circuit/SKILL.md"));
    expect(scene).toBeDefined();
    expect(scene).toContain("wire uno.13 -> r1.1");
    expect(scene).toContain("wire r1.2 -> led1.A");
    expect(scene).toContain("wire led1.C -> uno.GND");
    const result = await new ShowcaseCore().run({ action: "sketch", scene });
    expect(result.issues ?? []).toEqual([]);
    expect(result.preview).toBeDefined();
  });
});
