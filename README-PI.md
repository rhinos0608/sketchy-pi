# Sketchy for Pi — native, single-tool extension

This fork runs the original Sketchy scene parser, layout engine, part catalog, rasterizer and interactive HTML viewer **directly inside Pi**. It does not start, connect to or require an MCP server.

Sketchy registers exactly **one** native Pi tool, **showcase**, but keeps it **out of the model's active tool list and system prompt by default**. `/showcase` enables it for one agent turn. Its action parameter groups the original Sketchy tool operations into one API; three packaged skills cover diagrams, repository architecture and circuits. Their skill metadata is also absent from ordinary agent prompts.

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

In interactive Pi, use `/showcase draw an API flow with a cache` to make a drawing immediately. Or enter `/showcase` by itself to arm the tool for your **next** regular prompt. It is automatically removed from model context when that agent turn ends. `/showcase off` disarms it without starting a turn. This removes the tool's full schema, prompt snippet, and packaged skill descriptions from unrelated requests; it does not merely block calls. Pi's `/tools` or CLI restrictions still take precedence if they prohibit the tool.

While activated, the agent can send the following parameters to the single `showcase` tool:

    {"action":"sketch","scene":"title Web request\ndir right\nclient Client @globe\napi API @server\nclient -> api HTTPS"}
    {"action":"edit_sketch","changes":"db Database (cylinder)\napi -> db query"}
    {"action":"search_parts","query":"arduino-uno"}
    {"action":"new_scene","payload":{"title":"Demo"}}
    {"action":"add_node","payload":{"id":"api","label":"API"}}
    {"action":"render","open":true}

The tool returns a PNG preview in ~/.sketchy/pi-terminal/ and an offline interactive HTML page in ~/.sketchy/exports/. Pi's tool renderer shows the PNG when supported by the terminal. Interactive HTML adds hover, walkthrough steps, sliders and SVG, PNG and Excalidraw export. Set SKETCHY_OPEN=1 to open every new diagram in the browser or supply open=true for a single call.

Photos are optional. Use find_image, locate and choose_model actions to search freely licensed photos and run the local Florence-2 vision model. The extension asks before downloading any model.

## Distribution

    npm run pack:pi

This builds the engine and creates an installable npm/Pi package tarball and a ZIP containing all three skills in release/. The tarball contains the compiled engine, viewer, part catalog and native extension. Install it with the absolute path:

    pi install /Users/rhinesharar/sketchy-pi/release/<name>.tgz

The ZIP is an optional portable skills bundle; native Pi package discovery uses pi/skills/ directly.

## Architecture

- src/pi/showcase.ts — native action dispatcher and controller; no MCP import.
- pi/extension.ts — single tool registration, sequential scene execution and Pi terminal UI.
- pi/activation.ts — command-driven, one-turn tool and skill-prompt activation. The native tool defaults to inactive.
- pi/skills/ — Pi Agent Skills.
- src/server.ts — original upstream MCP integration retained for non-Pi clients; not used by showcase.

The fork preserves upstream MIT licensing and THIRD_PARTY_NOTICES.md.
