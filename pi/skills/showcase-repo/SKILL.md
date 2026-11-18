---
name: showcase-repo
description: Visualise local repository structure and control flow using native showcase diagrams, grouped code nodes, and file links.
---

# Showcase a repository

Inspect actual repo entry points, packages, imports and key execution paths first. Use the single native showcase tool, action="sketch", with grouped modules and directional arrows. For each file-backed node include file=<absolute path> so the standalone viewer can open the correct source file in the configured editor. Add 3–7 steps where a data flow benefits from walkthrough.

Example:

    title Codebase request path
    dir right
    group app Application
    router Router in app file=/absolute/path/router.ts
    service Service in app file=/absolute/path/service.ts
    database Database (cylinder)
    router -> service calls
    service -> database queries
    step Dispatch: Router selects handler | router service router->service

Base the diagram on inspected files rather than invented modules. Subsequent changes use action="edit_sketch". For full grammar consult the showcase skill's references/syntax.md.
