---
name: vyora-desktop-ux
description: Design and review VYORA's Windows desktop interface, including operator Studio, capture and review, templates, printing, and the local guest kiosk. Use for desktop layout, copy, accessibility, and visual polish.
---

# VYORA desktop experience

Start at the affected flow in `apps/desktop/src`. Inspect the native Electron UI when available. Reuse controls and theme tokens from `theme.css` and the relevant component styles, along with the shared VYORA artwork. Keep theme changes separate from capture effects and strip output.

- In **Studio**, make the active camera, session state, and next action clear. Keep setup, template editing, and printer controls easy to find. Preserve space for the live preview and use copy that describes the actual device or operation.
- In the **guest kiosk**, make the frame choice, countdown, retake, save, and next-group actions legible at a distance and easy to tap. Keep operator setup and exit controls distinct from guest actions. Read `docs/guest-kiosk-mode.md` or `docs/guest-displays.md` when changing those surfaces.
- For **capture and review**, make selected retake slots, partial sessions, and save failures easy to understand. Preserve the pending strip through recoverable errors. Keep preview and countdown responsive by checking repeated image work and renders on the live path.
- For **printing**, distinguish an accepted Windows print job from a confirmed physical result. Keep paper layout and recovery actions explicit. Read `docs/printing.md` for the existing workflow.
- Check the changed surface in a compact window and, where relevant, at Windows display scaling or in full-screen guest mode. Check keyboard focus, touch targets, preview sizing, and the failure or recovery state you changed. Use `$vyora-e2e` to verify the underlying flow with an isolated test library.
