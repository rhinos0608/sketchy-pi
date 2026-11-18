---
name: showcase
description: Native Showcase diagram syntax and editing guidance. Use when the user explicitly requests a drawing, diagram, or visualization.
---

# Showcase drawings

Use the native `showcase` tool when a diagram is requested. Activation with `/showcase` makes the tool available; it does not itself require a drawing in every subsequent reply.

For a new diagram, call `showcase` with `action="sketch"` and a newline-delimited `scene`. This creates and renders the scene in one call. Start with these compact forms:

```text
title Web request
dir right
browser Browser @globe
api API @server
browser -> api HTTPS
```

For changes to that scene, use `action="edit_sketch"` with `changes` containing the lines to add or replace. Use `remove <id>` to delete an element. `edit_sketch` requires a preceding compact `sketch` in the current scene.

For basic diagrams, the syntax above is sufficient. Read `references/syntax.md` only when the requested visual needs groups, steps, drawings, plots, data structures, maps, circuits, or other advanced syntax.

The tool also supports a JSON scene through `action="sketch", payload={...}` and incremental edits through actions such as `add_node` and `add_edge` followed by `render`; see its tool schema for arguments. Set `open=true` only when the interactive page is wanted.

For a requested photographic illustration, `find_image` searches reusable photos and `locate` identifies regions with the local vision backend. Selecting or downloading a model requires user approval.
