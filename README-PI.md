# Sketchy for Pi — native, single-tool extension

This fork runs the original Sketchy scene parser, layout engine, part catalog, rasterizer and interactive HTML viewer **directly inside Pi**. It does not start, connect to or require an MCP server.

Sketchy registers exactly **one** native Pi tool, **showcase**, but keeps it **out of the model's active tool list and system prompt by default**. `/showcase` enables it for the current Pi session until explicitly disabled. Its action parameter groups the original Sketchy tool operations into one API; three packaged skills cover diagrams, repository architecture and circuits. Their skill metadata is also absent from ordinary agent prompts.

## Install

On the MacBook with Pi installed:

    cd ~/sketchy-pi
    npm ci
    npm run build
    pi install /Users/rhinesharar/sketchy-pi

Restart Pi or run /reload. This loads the extension plus its skills via the package.json Pi manifest, without adding them to regular model prompts. Do not add the old Sketchy MCP server to Pi.

To test only this extension from the checkout without modifying settings:

    pi --no-extensions -e ./pi/extension.ts

## Usage

In interactive Pi, use `/showcase draw an API flow with a cache` to enable the tool and draw immediately. Or enter `/showcase` by itself to enable it for the **rest of this Pi session**. It remains declared and callable across subsequent prompts, until `/showcase off` explicitly removes it from model context or a new session begins. `/showcase status` reports registered/active state without sending a model request. Before activation, its full schema, prompt snippet, and three skill descriptions are absent from model requests; this is not an execution-only block. Pi's `/tools` or CLI restrictions still take precedence if they prohibit the tool. `tool_search` only discovers `deferred`/`codemode` tools, not this direct tool; check `/showcase status` instead of expecting it to appear in `tool_search`.

While activated, the agent can send the following parameters to the single `showcase` tool:

    {"action":"sketch","scene":"title Web request\ndir right\nclient Client @globe\napi API @server\nclient -> api HTTPS"}
    {"action":"edit_sketch","changes":"db Database (cylinder)\napi -> db query"}
    {"action":"search_parts","query":"arduino-uno"}
    {"action":"new_scene","payload":{"title":"Demo"}}
    {"action":"add_node","payload":{"id":"api","label":"API"}}
    {"action":"render","open":true}

The tool returns a PNG preview in ~/.sketchy/pi-terminal/ and an offline interactive HTML page in ~/.sketchy/exports/. Pi's tool renderer shows the PNG when supported by the terminal. Interactive HTML adds hover, walkthrough steps, sliders and SVG, PNG and Excalidraw export. Set SKETCHY_OPEN=1 to open every new diagram in the browser or supply open=true for a single call.

Photos are optional. Use find_image, locate and choose_model actions to search freely licensed photos and label regions. On Apple Silicon, photo grounding and open-vocabulary detection use a persistent local **MLX-VLM / Florence-2** Python worker, not ONNX or MCP. Printed-text boxes use **macOS Vision OCR**, because the converted medium Florence checkpoint currently generates invalid OCR output. The extension asks before downloading model weights.

The **medium** tier is `mlx-community/Florence-2-large-ft-8bit` (approximately 900 MB). It is stored at `~/.sketchy/models/Florence-2-large-ft-8bit/`, with a private Python 3.12 MLX runtime at `~/.sketchy/mlx/venv/`. The native Vision helper is built to `~/.sketchy/mlx/vision-ocr`. Downloads and compilation are lazy; normal drawings do not start Python or initialize MLX. This photo-labeling backend requires an Apple Silicon Mac. The original non-Pi photo backend is not used in this fork.

Use `showcase` with `action=model_status` to check readiness and `action=locate`, `image=<id>` and `queries=[...]` to label the photo. Once loaded, the MLX worker stays resident for repeated requests; results are saved in SQLite and rendered as JPEG previews.

## Distribution

    npm run pack:pi

This builds the engine and creates an installable npm/Pi package tarball and a ZIP containing all three skills in release/. The tarball contains the compiled engine, viewer, part catalog and native extension. Install it with the absolute path:

    pi install /Users/rhinesharar/sketchy-pi/release/<name>.tgz

The ZIP is an optional portable skills bundle; native Pi package discovery uses pi/skills/ directly.

## Architecture

- src/pi/showcase.ts — native action dispatcher and controller; no MCP import.
- pi/extension.ts — single tool registration, sequential scene execution and Pi terminal UI.
- pi/activation.ts — session-scoped, opt-in tool and skill-prompt activation, with explicit off/status commands. The native direct tool defaults to inactive.
- pi/skills/ — Pi Agent Skills.
- src/server.ts — original upstream MCP integration retained for non-Pi clients; not used by showcase.

The fork preserves upstream MIT licensing and THIRD_PARTY_NOTICES.md.
