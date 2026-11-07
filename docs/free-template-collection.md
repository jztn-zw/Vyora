# Included VYORA frames

The desktop app ships eleven free frame designs (25 layouts). Seven designs
provide 2-, 3- and 4-photo versions. The four newer designs use their supplied
photo counts and full-resolution artwork.

- Flash Notes has four photos, following the printed 01–04 labels.
- Night Index has three photos, starting with the large right opening, then
  the two smaller left openings from top to bottom.
- Lavender Retro has three photos from top to bottom.
- Booth Chronicle has four photos in reading order, left to right on each row.

These four choices stay available at their native capture count in Studio and
the guest booth. Their photo bounds follow the PNG's actual transparent openings,
with a small bleed under the frame edges. All four originals are preserved byte
for byte and recorded in `provenance.json`.

The seven designs with count variants are Classic, Film 400, Urban Pop,
Neon Orbit, Good Vibes, Vintage Memories, and Pink Friends. Each design appears
once under **Strip template**, organizer setup and the guest frame picker.
Native designs and imported custom frames retain their own photo counts.
Previously saved variant selections migrate to their single design choice.

Full-resolution transparent PNGs, picker previews, and the layout manifest live
in `apps/desktop/assets/free-frames/`. They are bundled as desktop resources and
remain available offline. Included frames are read-only, separate from the 50
editable custom-template slots. User imports are retained.

The supplied original-count artwork for the first six designs is copied without
pixel changes; SHA-256 values are recorded in `provenance.json`. New count
variants and Pink Friends refinements use the built-in imagegen tool. The image
files in Downloads are never overwritten. New variants adapt the layout and
ornament placement; they are not pixel-identical copies of the source layout.

## Generation prompt set

Each new variant uses its matching supplied PNG as an edit target. The shared
prompt specifies: preserve the reference's original logo typography, colors,
textures and detailed ornaments; change only the opening layout to exactly the
requested number of photos; retain header/footer branding; reflow the same
ornaments around the windows; use real transparent alpha photo interiors and
opaque exterior artwork; no sample photos, count labels, mockup or exterior
margins. Outputs were inspected and corrected when counts or alpha were wrong.

Per-design invariants:

- Classic: champagne aperture-letter VYORA header, PHOTOBOOTH lettering, black
  texture, fine double-line edging, large subdued aperture footer.
- Film 400: textured black analog film, white sprocket marks and triangles,
  vertical VYORA FILM 400 labels, spaced VYORA footer.
- Urban Pop: purple/magenta collage, torn paper logo header, tape, camera,
  headphones, clapperboard, paperclip, aperture sticker, film footer, tilted paper
  and oval window motifs.
- Neon Orbit: violet/magenta orbital ribbons, aperture symbol, VYORA PHOTOBOOTH
  footer, stars, portrait-film stickers, luminous rounded window edges.
- Good Vibes: red/orange checkerboard, GOOD VIBES header and camera, dimensional
  VYORA footer, retro stickers, pixel hearts, stars, game console, cassette,
  cherries, smiley, vinyl, ticket, sunglasses, flag and disco ball.
- Vintage Memories: cream paper and pink doodles, original serif VYORA lettering,
  good memories note, tape, hearts, sparkles, social motifs, Just VYORA Things,
  MUSIC MOOD PEOPLE, BRIGHTER DAYS, and music controls.
- Pink Friends: preserve the bunny, bear and cat style, pink camera, hearts,
  sparkles, ribbons, film stickers and purple/magenta VYORA PHOTOBOOTH footer;
  refine spacing, illustration edges and background, remove baked checkerboards
  and creases from the photo openings.

## Validation and regeneration

`npm run test:free-frames` checks family/count completeness, image dimensions,
capture limits, strip export mappings, immutable included frames, custom-library
coexistence and original artwork hashes.

`apps/desktop/scripts/prepare-free-frames.ps1` inspects real alpha components,
checks the number of openings, derives ordered photo bounds with small bleed,
and generates 240-pixel picker previews plus a diagnostic contact sheet. It
does not rewrite the full-resolution artwork. The contact sheet is written to
`apps/desktop/out/free-frame-collection-preview.png`.

Printing retains the existing fixed 2 × 6 inch placement and contains the artwork
without stretching; compact layouts can leave space within that placement.
