import { afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ShowcaseCore, ACTIONS } from "../src/pi/showcase.js";

describe("native Pi showcase", () => {
  let dir: string | undefined;
  let core: ShowcaseCore;

  async function init() {
    dir ??= await mkdtemp(join(tmpdir(), "sketchy-showcase-"));
    core ??= new ShowcaseCore({ dataDir: dir });
    return core;
  }

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("exposes a single native dispatcher with the original sketch actions", () => {
    expect(ACTIONS).toContain("search_parts");
    expect(ACTIONS).toContain("locate");
    expect(ACTIONS).toContain("sketch");
    expect(ACTIONS).toContain("edit_sketch");
  });

  it("searches the real hardware catalog", async () => {
    const result = await (await init()).run({ action: "search_parts", query: "arduino-uno" });
    expect(result.text).toContain("Pins:");
    expect(result.text).toContain("Arduino Uno");
  });

  it("renders and patches a complete scene, preserving the previous layout", async () => {
    const showcase = await init();
    const first = await showcase.run({
      action: "sketch",
      scene: "title Native Test\ndir right\nbrowser Browser @globe\napi API @server\nbrowser -> api HTTPS\nstep Request: Browser to API | browser api browser->api",
    });
    expect(first.text).toContain("2 nodes");
    expect(first.page).toBeDefined();
    expect(first.preview).toBeDefined();
    await stat(first.page!);
    const png = await stat(first.preview!);
    expect(png.size).toBeGreaterThan(500);

    const edit = await showcase.run({
      action: "edit_sketch",
      changes: "db Database (cylinder)\napi -> db query",
    });
    expect(edit.text).toContain("3 nodes");
    expect(edit.text).toContain("2 edges");
    await stat(edit.page!);
  });

  it("supports original MCP-style incremental payloads without an MCP server", async () => {
    const showcase = await init();
    await showcase.run({ action: "new_scene", payload: { title: "Incremental" } });
    await showcase.run({ action: "add_box", payload: { id: "app", label: "App" } });
    await showcase.run({ action: "add_node", payload: { id: "db", label: "Database", shape: "cylinder" } });
    await showcase.run({ action: "add_edge", payload: { from: "app", to: "db", label: "query" } });
    const result = await showcase.run({ action: "render" });
    expect(result.text).toContain("2 nodes");
    expect(result.text).toContain("1 edges");
    await stat(result.page!);
  });
});
