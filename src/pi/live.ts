import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import type { LaidOutScene } from "../scene/laid-out.js";

const VIEWER_URL = new URL("../../build/live.html", import.meta.url);
const HOST = "127.0.0.1";
const MAX_BODY = 4 * 1024 * 1024;
const BASE64_PNG = /^[A-Za-z0-9+/]+={0,2}$/;

export type RefineRequest = { text: string; image?: string };
export type LiveShowcaseConfig = {
  onRefine?: (request: RefineRequest) => Promise<void> | void;
  openBrowser?: (url: string) => void;
};

function defaultOpenBrowser(url: string): void {
  const [command, args] = process.platform === "darwin"
    ? ["open", [url]]
    : process.platform === "win32"
      ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
      : ["xdg-open", [url]];
  execFile(command, args, (error) => {
    if (error) console.error("showcase: could not open live viewer:", error.message);
  });
}

/**
 * One loopback-only HTTP server per Pi session. The client runs the original
 * Sketchy interactive renderer and receives layout changes over SSE.
 * Browser refinement requests return to the active Pi session.
 */
export class LiveShowcase {
  private server?: Server;
  private starting?: Promise<string>;
  private clients = new Set<ServerResponse>();
  private scene?: LaidOutScene;
  private revision = 0;
  private opened = false;
  private html?: string;
  private baseUrl?: string;

  constructor(private readonly options: LiveShowcaseConfig = {}) {}

  get url(): string | undefined {
    return this.baseUrl;
  }

  private async start(): Promise<string> {
    if (this.baseUrl) return this.baseUrl;
    if (this.starting) return this.starting;
    this.starting = this.startInternal();
    try {
      return await this.starting;
    } finally {
      this.starting = undefined;
    }
  }

  private async startInternal(): Promise<string> {
    this.html = await readFile(VIEWER_URL, "utf8");
    const server = createServer((req, res) => { void this.respond(req, res); });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, HOST, () => {
          server.off("error", reject);
          resolve();
        });
      });
    } catch (error) {
      this.server = undefined;
      throw error;
    }
    const port = (server.address() as AddressInfo).port;
    this.baseUrl = `http://${HOST}:${port}`;
    return this.baseUrl;
  }

  /** Start the loopback server without opening the browser. */
  async ensure(): Promise<string> { return this.start(); }

  async open(force = false): Promise<string> {
    const url = await this.start();
    if (!this.opened || force) {
      this.opened = true;
      (this.options.openBrowser ?? defaultOpenBrowser)(url);
    }
    return url;
  }

  async publish(scene: LaidOutScene, { open = true }: { open?: boolean } = {}): Promise<string> {
    const url = await this.start();
    this.scene = scene;
    this.revision++;
    for (const client of this.clients) {
      try {
        client.write(`event: scene\ndata: ${this.revision}\n\n`);
      } catch {
        this.clients.delete(client);
      }
    }
    if (open) await this.open();
    return url;
  }

  private send(res: ServerResponse, status: number, data: string, contentType = "text/plain; charset=utf-8"): void {
    res.writeHead(status, {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Access-Control-Allow-Origin": "none",
    });
    res.end(data);
  }

  private async respond(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.baseUrl || req.headers.host !== new URL(this.baseUrl).host) {
      return this.send(res, 403, "Invalid Host");
    }
    const path = new URL(req.url ?? "/", this.baseUrl).pathname;
    if (req.method === "GET" && path === "/") {
      return this.send(res, 200, this.html!, "text/html; charset=utf-8");
    }
    if (req.method === "GET" && path === "/scene") {
      return this.send(res, 200,
        JSON.stringify({ revision: this.revision, scene: this.scene ?? null }),
        "application/json; charset=utf-8");
    }
    if (req.method === "GET" && path === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "X-Content-Type-Options": "nosniff",
        "Connection": "keep-alive",
      });
      res.write(": connected\n\n");
      this.clients.add(res);
      res.on("close", () => { this.clients.delete(res); });
      return;
    }
    if (req.method === "POST" && path === "/refine") {
      if (req.headers.origin !== this.baseUrl ||
          !req.headers["content-type"]?.startsWith("application/json")) {
        return this.send(res, 403, "Same-origin JSON requests only");
      }
      if (!this.options.onRefine) return this.send(res, 409, "Refinement unavailable");
      try {
        let total = 0;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          total += bytes.length;
          if (total > MAX_BODY) return this.send(res, 413, "Request too large");
          chunks.push(bytes);
        }
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (!body || typeof body !== "object") return this.send(res, 400, "Invalid request");
        const input = body as { text?: unknown; image?: unknown };
        const text = typeof input.text === "string" ? input.text.trim() : "";
        const image = typeof input.image === "string" ? input.image : undefined;
        if (!text || text.length > 4000 ||
            (image !== undefined && (!BASE64_PNG.test(image) || image.length > MAX_BODY))) {
          return this.send(res, 400, "Provide a refinement request of up to 4000 characters");
        }
        await this.options.onRefine({ text, ...(image ? { image } : {}) });
        return this.send(res, 202, JSON.stringify({ queued: true }), "application/json");
      } catch (error) {
        return this.send(res, 400, error instanceof Error ? error.message : "Invalid refinement");
      }
    }
    this.send(res, 404, "Not found");
  }

  async close(): Promise<void> {
    for (const client of this.clients) client.end();
    this.clients.clear();
    const server = this.server;
    this.server = undefined;
    this.baseUrl = undefined;
    this.opened = false;
    this.scene = undefined;
    this.revision = 0;
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }
}
