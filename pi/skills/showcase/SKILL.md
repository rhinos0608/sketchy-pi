---
name: showcase
description: Draw or edit architecture, flowcharts, pictures, timelines, cycles, maps, molecules and diagrams using the native Pi showcase tool. Use when a visual explanation helps or the user asks for a diagram.
---

# Showcase — native Sketchy for Pi

Call the single Pi tool named showcase. It calls Sketchy's original layout and render engine directly, **without MCP**.

## Workflow

1. Choose a form: nodes/arrows for systems, draw for physical illustrations, and the dedicated timeline, cycle, pyramid, funnel, venn, matrix, mindmap, molecule or map blocks where appropriate.
2. Call showcase with action="sketch" and scene containing a compact scene, one line per item.
3. View the image preview in a capable Pi terminal; the tool also gives a standalone interactive HTML page with hover details, steps, sliders, and export.
4. Change a prior compact scene with action="edit_sketch" and changes containing the patch lines. Existing ids are replaced; new ids are added; remove <id> deletes.
5. Explain the useful insight rather than duplicating all the visual labels.

For complete syntax **read references/syntax.md**. It is generated from upstream's original Sketchy parser documentation.

Example params:

    {"action":"sketch","scene":"title Web request\ndir right\nbrowser Browser @globe\napi API @server !accent\ndb Database (cylinder)\nbrowser -> api HTTPS\napi -> db query\nstep Request: Browser talks to API | browser api browser->api"}

Then:

    {"action":"edit_sketch","changes":"cache Cache (cylinder)\napi -> cache lookup\ncache -> db miss"}

Set open=true to open the interactive page automatically, or set SKETCHY_OPEN=1 for that default.

## All original Sketchy operations under one native tool

The action parameter supports sketch, edit_sketch, new_scene, add_box, add_node, add_text, add_group, add_edge, add_arrow, place_part, connect, label, add_step, add_image, render, search_parts, search_icons, find_image, locate, choose_model, download_model and model_status.

Incremental action arguments go into payload, preserving the MCP tool's original named arguments:

    {"action":"add_box","payload":{"id":"svc","label":"Service","icon":"lucide:server"}}
    {"action":"add_edge","payload":{"from":"svc","to":"db","label":"reads"}}
    {"action":"render"}

The complete JSON sketch schema is also accepted under payload for action=sketch. For part types and pin names use search_parts with query; for icons use search_icons with query. For photos, find_image with query, locate with image id plus queries array, then sketch with image <id> and label lines. Photo grounding requires a local Florence-2 model chosen with choose_model; downloading requires approval.

Never invoke Sketchy MCP tools or start its MCP server in Pi. Use showcase directly.
