import type { LaidOutScene } from "../../src/scene/laid-out.js";
import { mountScene, type Host } from "./scene-view.js";
import "./styles.css";

const root = document.getElementById("app")!;
const connection = document.getElementById("live-status")!;
const form = document.getElementById("refine-form") as HTMLFormElement;
const input = document.getElementById("refine-text") as HTMLTextAreaElement;
const send = document.getElementById("refine-send") as HTMLButtonElement;
const status = document.getElementById("refine-status")!;

let revision = -1;
let dispose: (() => void) | undefined;

async function postRefinement(text: string, image?: string): Promise<boolean> {
  try {
    const res = await fetch("/refine", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, ...(image ? { image } : {}) }),
    });
    if (!res.ok) throw new Error(await res.text());
    status.textContent = "Sent to Pi. The next drawing update will appear here automatically.";
    return true;
  } catch (error) {
    status.textContent = "Could not send to Pi: " +
      (error instanceof Error ? error.message : String(error));
    return false;
  }
}

const host: Host = {
  openLink(url) {
    window.open(url, "_blank", "noopener");
  },
  openFile({ link }) {
    if (link) window.location.href = link;
  },
  async download({ name, mimeType, text, base64 }) {
    const blob = text !== undefined
      ? new Blob([text], { type: mimeType })
      : new Blob([Uint8Array.from(atob(base64!), (c) => c.charCodeAt(0))], { type: mimeType });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  },
  ask(message) {
    return postRefinement(message.text, message.image);
  },
};

async function refresh(): Promise<void> {
  try {
    const response = await fetch("/scene", { cache: "no-store" });
    if (!response.ok) throw new Error("Viewer connection failed");
    const data = await response.json() as { revision: number; scene: LaidOutScene | null };
    if (data.revision <= revision) return;
    revision = data.revision;
    const oldCanvas = root.querySelector<HTMLElement>(".canvas");
    const scrollLeft = oldCanvas?.scrollLeft ?? 0;
    const scrollTop = oldCanvas?.scrollTop ?? 0;
    dispose?.();
    dispose = undefined;
    if (data.scene) {
      dispose = mountScene(root, data.scene, host);
      const newCanvas = root.querySelector<HTMLElement>(".canvas");
      if (newCanvas) {
        newCanvas.scrollLeft = scrollLeft;
        newCanvas.scrollTop = scrollTop;
      }
    } else {
      root.innerHTML = '<div class="live-empty">Waiting for a Showcase drawing from Pi…</div>';
    }
    connection.textContent = "Live · revision " + revision;
  } catch (error) {
    connection.textContent = "Offline · reconnecting";
    console.error("Showcase live refresh failed", error);
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  send.disabled = true;
  void postRefinement(text).then((ok) => {
    if (ok) input.value = "";
  }).finally(() => { send.disabled = false; });
});

const events = new EventSource("/events");
events.addEventListener("open", () => { void refresh(); });
events.addEventListener("scene", () => { void refresh(); });
events.addEventListener("error", () => { connection.textContent = "Reconnecting…"; });
void refresh();
