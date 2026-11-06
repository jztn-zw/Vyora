# VYORA

VYORA is an offline-first Windows photobooth with a separate website. Run npm commands from this directory and use the single workspace lockfile. See [project structure](docs/project-structure.md) for entry points and [architecture](docs/architecture.md) for boundaries.

- `apps/desktop` owns capture, local SQLite and strip files, printing, and local guest-device pairing. Keep capture, saving, and printing independent of the internet and website API.
- Keep privileged desktop actions in the Electron main process behind the existing validated preload bridge. Preserve sender checks and guest-device pairing permissions when changing desktop or local-network entry points.
- `apps/client` owns the React website and guest viewer. `apps/server` owns its HTTP API. Reuse the VYORA artwork and shared contracts in `packages/shared`.
- Trace the affected flow and reuse what the workspace already provides. Choose the smallest complete change that handles failure and recovery. Use sample images for demos and tests.
- When implementing online sharing, start with explicit sharing of a saved strip. Scope each guest link to one session. Keep storage credentials on the server and local strips available even if an upload fails or the online copy is removed.

## Workflows

- Use `$vyora-web-design` for website art direction, copy, and visual review.
- Use `$vyora-desktop-ux` for the Windows Studio, capture and review, templates, printing, and guest kiosk interface.
- Use `$vyora-e2e` to verify browser and Electron user flows. For code changes, run the relevant focused checks, `npm run lint`, and `npm run typecheck`. Use `$lint-and-validate` when available.
- Use the built-in `$skill-creator` when creating or revising a project workflow. Put project skills in `.agents/skills/` and keep the workflow instructions there.
