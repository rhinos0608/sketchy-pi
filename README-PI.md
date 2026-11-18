# Sketchy for Pi — native, single-tool extension

This fork runs the original Sketchy scene parser, layout engine, part catalog, rasterizer and interactive HTML viewer **directly inside Pi**. It does not start, connect to or require an MCP server.

Pi sees exactly **one** additional model-callable tool: **showcase**. Its action parameter groups the original Sketchy tool operations into a single native API. Three packaged skills cover diagrams, repository architecture and circuits.

## Install

On the MacBook with Pi installed:

    cd ~/sketchy-pi
    npm ci
    npm run build
    pi install /Users/rhinesharar/sketchy-pi

Restart Pi or run /reload. This loads the extension plus its skills via the package.json Pi manifest. Do not add the old Sketchy MCP server to Pi.

To test only this extension from the checkout without modifying settings:

    pi --no-extensions -e ./pi/extension.ts

## Usage

Send the following tool parameters to showcase:

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
- pi/extension.ts — single tool registration and Pi terminal UI.
- pi/skills/ — Pi Agent Skills.
- src/server.ts — original upstream MCP integration retained for non-Pi clients; not used by showcase.

The fork preserves upstream MIT licensing and THIRD_PARTY_NOTICES.md.
