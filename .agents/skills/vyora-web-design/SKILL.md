---
name: vyora-web-design
description: Design or review the VYORA website for brand fit, visual taste, and generic AI design or copy. Use for art direction, landing pages, guest viewer layouts, and anti-slop passes.
---

# VYORA website design

Read the relevant route in `apps/client` and inspect the VYORA artwork in `packages/shared/assets`. For an existing page, look at it in a browser before changing the layout. For a new page or major redesign, choose a visual reference and describe the direction in terms of type, color, composition, and imagery before implementing it.

- Let the physical photo strip shape the page. Use its portrait proportions, real booth UI, and frame samples with test imagery. Use VYORA's purple and pink from the shared artwork with a restrained surrounding palette. Keep the original lettering and emblem intact.
- Give each page one primary job. Show operators what the booth does with a real screenshot and a clear next step. On a guest link, put the strip and **Download photo strip** where a guest can find them immediately after scanning. Keep the strip legible without cropping it.
- Audit for repeated feature cards, decorative gradients, gratuitous motion, vague headlines, and dead buttons. Fix the ones that distract from the page's job. Write concrete copy about capture, retakes, printing, or download, with claims supported by working features. Use synthetic or approved imagery for public samples.
- Review the rendered page at phone and desktop widths. Check heading wraps, strip scale, contrast, overflow, visible keyboard focus, and any loading, error, or expired-link state the route supports. If adding motion, check reduced motion as well. Use `$vyora-e2e` to exercise the actions behind the design.
