# VYORA Windows icon

- `vyora-icon.png`: final application icon in original violet, magenta, and
  metallic-white colors on a dark rounded tile,
  transparent outside the tile.
- `vyora-icon-monochrome.png`: earlier near-white tile variant, retained as an alternative.
- `vyora-icon-emblem.png`: transparent charcoal emblem preparation.
- `vyora.ico`: Windows icon containing 16, 24, 32, 48, 64, 128, and 256 px entries.

The built-in image generation tool prepared the icon from the user-provided
brand sheet. It is a derived raster asset. The interface's logo lettering still
uses the original unmodified artwork in `packages/shared/assets/`.

The emblem has no lettering because the full wordmark is unreadable at Windows
taskbar sizes. It retains the photobooth strip, silhouettes, aperture, orbit,
four-point star, and sparkles. The dark tile provides contrast for the original
metallic-white, violet, and pink artwork. The user's later original-color poster
is the authoritative palette reference, preserved in `packages/shared/assets/`.

Regenerate the ICO after replacing the PNG:

```powershell
npm run build:icon --workspace=@vyora/desktop
npm run make:desktop
```

Forge embeds the ICO in `VYORA.exe` and the installer. The installed shortcuts
inherit the executable's icon. The Electron window also loads the same ICO.
No existing installation or desktop shortcut is modified by the source build.

## Built-in generation prompts

Emblem preparation:

> Use case: background-extraction. Edit target: attached VYORA brand presentation sheet. Produce ONE standalone transparent square application-icon PNG asset, no sheet, no text. Extract/preserve the EXACT VYORA emblem shown in the middle row's black monochrome version (second logo from left), equivalent to the top-right large emblem: tilted photobooth strip with TWO human silhouettes, another tilted photo frame behind, four-point curved star with photographic aperture shutter at its center, sweeping elliptical orbit from lower left to upper right, one small sparkle left and TWO sparkles upper right. Preserve all original geometry, orientations, proportions and details; do not design a new symbol. Change only colors and background: use crisp dark charcoal #202020 emblem on an actually transparent background, with white/transparent negative-space openings. No purple or pink. No glow, no shadows, no background tile, no lettering, no VYORA text, no PHOTOBOOTH caption. Entire emblem centered with about 8 percent safe transparent margin, not cropped. High resolution 1024x1024. It must read as the exact supplied logo emblem adapted as a monochrome Windows desktop app icon.

Earlier monochrome tile preparation:

> Use case: precise-object-edit. Edit target: the transparent black VYORA emblem attached. Make this into a polished Windows desktop app icon matching a white and charcoal UI. PRESERVE the emblem exactly: same geometry, all original photo strips with two silhouettes, aperture, curved four pointed star, orbital ring and three sparkles. Only add a solid near-white (#fafafa) rounded-square tile BEHIND the existing dark charcoal emblem so it remains visible on dark Windows wallpapers/taskbars. Transparent outside the rounded-square tile. Keep emblem dark charcoal (#202020) as now. Center it, scale to fit inside the tile with 12% interior margin, preserve proportions. Tile occupies 94% of square canvas and has smooth corners with radius about 20% of tile width. Very subtle thin light gray tile edge, no glow, no cast shadow, no gradient, no lettering. ONE square icon, high resolution 1024x1024. Do not crop emblem, do not change shape or logo details.

Final original-color icon preparation:

> Use case: background-extraction / precise-object-edit. The attached image is the user's ORIGINAL VYORA brand logo and its AUTHORITATIVE colors. Make ONE Windows desktop application icon from this EXACT emblem. Preserve its tilted photo strip with silhouettes, extra tilted photo frames, large curved four-point star with photographic aperture center, swooping elliptical orbit from lower left to upper right, and three sparkle stars. Do not redesign or simplify the logo. Match the original dimensional polished metallic rendering and exact palette: bright metallic white highlights, lavender and deep violet on left, hot pink/magenta on right, purple silhouettes. Remove ALL lettering ('VYORA' and 'PHOTOBOOTH'), all environmental glass shards, floor, reflections, background bokeh and poster scenery. Center the emblem on a plain very dark plum charcoal (#17131f) rounded-square application tile, with 12% safe interior padding and no emblem cropping. The tile occupies 94% of a square 1024x1024 canvas, with smooth rounded corners of 20% radius. TRUE TRANSPARENCY OUTSIDE the tile; no solid canvas background, no scattered artifacts or stray flecks outside tile. No added objects, no other logos, no text. This is the same original VYORA emblem isolated for a desktop icon, in ORIGINAL purple-pink-metallic-white colors. Keep the emblem large and readable, all tips and orbital ring contained within the tile.
