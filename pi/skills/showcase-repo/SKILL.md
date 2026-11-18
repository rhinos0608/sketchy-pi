---
name: showcase-repo
description: Draw an evidence-based repository architecture or code-flow diagram with native Showcase.
disable-model-invocation: true
---

# Repository diagram

Use when explicitly invoked for a repository visualization. The native `showcase` tool must first be enabled with `/showcase`.

Inspect the relevant repository entry points, imports, and execution paths. Diagram only the components supported by those files; label inferred relationships as such rather than presenting them as verified code behavior.

Call `showcase` with `action="sketch"`, using groups for modules and arrows for calls or data flow. For example:

```text
title Request path
dir right
group app Application
router Router in app
service Service in app
database Database (cylinder)
router -> service dispatches
service -> database queries
```

Include `file=<absolute path>` only if the user wants clickable local-editor links. Such paths are embedded in viewer output and may disclose local directory structure if an HTML export is shared. Walkthrough steps are optional, not a fixed requirement.

Use `action="edit_sketch"` for subsequent changes. For nonbasic syntax, see `../showcase/references/syntax.md`.
