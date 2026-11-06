# VYORA artwork

`vyora-brand-reference.png` is the user's original 1536 × 1024 brand presentation,
copied without alteration. It is bundled locally so branding also works offline.

`vyora-original-color-reference.png` is the user's later original violet, pink,
and metallic-white logo poster, also copied without alteration. It is the color
reference for the Windows app icon.

`../src/brand.css` displays the horizontal lockup, symbol, and wordmark through
fixed proportional CSS windows into this sheet. The stylized VYORA lettering,
aperture, photo strips, orbit, sparkles, and PHOTOBOOTH caption are original image
pixels, not approximations drawn in CSS or replacement typefaces.

Desktop Light and VYORA themes use exact windows into the fourth panel's original
purple/pink emblem and lettering. Dark uses an inverse monochrome treatment for
contrast. The standalone viewer keeps its monochrome branding. Blend modes
suppress the reference's flat background. These presentation filters leave the
source asset intact.

The supplied sheet does not include a font file or standalone vector master.
Do not claim its custom logo lettering is an installed UI font. If standalone
SVG or transparent PNG masters become available, replace the sheet presentation
with those assets while preserving these component proportions and labels.

Windows uses a standalone emblem PNG and multi-resolution ICO under
`apps/desktop/assets/`. These are separate application-icon assets; the UI
continues to display the unchanged reference artwork and exact lettering.

Photo strips embed exact crops of the monochrome emblem (409, 588, 191, 157)
and wordmark (379, 744, 226, 65), including the custom lettering and PHOTOBOOTH
caption. The offline data lives in `apps/desktop/src/strip-brand.json` and is
regenerated with `electron scripts/build-strip-brand.cjs` from the desktop
directory. SVG presentation filters remove the sheet background and produce
black or white artwork. No replacement font, tracing, or generated logo is used.
