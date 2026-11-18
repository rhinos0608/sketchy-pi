import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { LiveShowcase, type RefineRequest } from "../src/pi/live.js";
import { ShowcaseCore } from "../src/pi/showcase.js";

const servers: LiveShowcase[] = [];
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
  await Promise.all(dirs.splice(0).map((s) => rm(s, { recursive: true, force: true })));
});

async function setup() {
  const opens: string[] = [];
  const feedback: RefineRequest[] = [];
  const live = new LiveShowcase({
    openBrowser: (url) => { opens.push(url); },
    onRefine: (request) => { feedback.push(request); },
  });
  servers.push(live);
  const dataDir = await mkdtemp(join(tmpdir(), "showcase-live-"));
  dirs.push(dataDir);
  const core = new ShowcaseCore({ dataDir, openDefault: true, live });
  return { live, core, opens, feedback };
}

describe("live Pi Showcase browser workspace", () => {
  it("opens a loopback HTTP page and starts with no scene", async () => {
    const { live, opens } = await setup();
    const url = await live.open();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(opens).toEqual([url]);
    const html = await fetch(url).then((r) => r.text());
    expect(html).toContain("Showcase · Live");
    expect(html).toContain("Refine this diagram with Pi");
    expect(html).toContain("EventSource(");
    expect(html).toContain("/events");
    const initial = await fetch(url + "/scene").then((r) => r.json());
    expect(initial).toEqual({ revision: 0, scene: null });
    expect(await live.open()).toBe(url);
    expect(opens).toHaveLength(1);
    await live.open(true);
    expect(opens).toHaveLength(2);
  });

  it("keeps one URL and streams every compact-scene refinement", async () => {
    const { live, core, opens } = await setup();
    const url = await live.open();
    const first = await core.run({
      action: "sketch",
      scene: "title Architecture\nclient Client\napi API\nclient -> api request",
    });
    expect(first.page).toBe(url);
    expect(first.preview).toBeUndefined();
    const v1 = await fetch(url + "/scene").then((r) => r.json());
    expect(v1.revision).toBe(1);
    expect(v1.scene.nodes).toHaveLength(2);
    const abort = new AbortController();
    try {
      const sse = await fetch(url + "/events", { signal: abort.signal });
      expect(sse.headers.get("content-type")).toContain("text/event-stream");
      const reader = sse.body!.getReader();
      // Consume the initial comment to ensure the client is subscribed.
      const start = await reader.read();
      expect(new TextDecoder().decode(start.value)).toContain("connected");
      const edited = await core.run({
        action: "edit_sketch",
        changes: "cache Cache (cylinder)\napi -> cache lookup",
      });
      expect(edited.page).toBe(url);
      expect(opens).toEqual([url]);
      const event = await reader.read();
      expect(new TextDecoder().decode(event.value)).toContain("event: scene");
      const v2 = await fetch(url + "/scene").then((r) => r.json());
      expect(v2.revision).toBe(2);
      expect(v2.scene.nodes).toHaveLength(3);
      expect(v2.scene.edges).toHaveLength(2);
      const again = await core.run({ action: "render" });
      expect(again.page).toBe(url);
      expect((await fetch(url + "/scene").then((r) => r.json())).revision).toBe(3);
    } finally {
      abort.abort();
    }
  });

  it("sends browser feedback to Pi and rejects cross-site submissions", async () => {
    const { live, feedback } = await setup();
    const url = await live.open();
    const submit = (origin: string, payload: unknown) => fetch(url + "/refine", {
      method: "POST",
      headers: { "Origin": origin, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    expect((await submit(url, { text: "Move the database to the right" })).status).toBe(202);
    expect(feedback).toEqual([{ text: "Move the database to the right" }]);
    expect((await submit("https://untrusted.example", { text: "Change everything" })).status).toBe(403);
    expect((await submit(url, { text: "" })).status).toBe(400);
    expect(feedback).toHaveLength(1);
    const badHostStatus = await new Promise<number>((resolve, reject) => {
      const address = new URL(url);
      const req = request({ hostname: "127.0.0.1", port: Number(address.port), path: "/scene",
        headers: { Host: "example.com" } }, (res) => {
        res.resume(); res.on("end", () => resolve(res.statusCode!));
      });
      req.on("error", reject);
      req.end();
    });
    expect(badHostStatus).toBe(403);
  });

  it("closes the local port cleanly", async () => {
    const { live } = await setup();
    const url = await live.open();
    await live.close();
    expect(live.url).toBeUndefined();
    await expect(fetch(url + "/scene")).rejects.toThrow();
  });
});
