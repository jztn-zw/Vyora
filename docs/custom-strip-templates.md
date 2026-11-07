# Custom strip templates

In the booth settings, open **Frame**, then choose **Upload a template**.

1. Choose a PNG or JPEG from your computer.
2. Review any automatically detected photo areas. The importer recognizes large,
   enclosed transparent openings and white rectangular photo boxes. It does not
   recognize arbitrary photographed faces or remove an opaque background.
3. If areas were not detected, draw four rectangles on the image. If the artwork
   has extra openings, mark the four you want to use. Extra openings remain empty.
   Select an area directly on the image or in the capture
   order list. Drag the area to move it. Hover near a corner until the resize
   cursor appears, then drag to resize. The corner targets are invisible, without
   square handles. Use the width and height fields to adjust one dimension precisely.
   Areas stay inside the frame,
   with a minimum width and height of 2%. Percentage fields are available for precision.
   Arrow keys adjust a focused area or handle by 0.1%; hold Shift for 1% steps.
   Escape cancels an active drag and restores its previous position and size.
   **Center selected** centers one area horizontally; **Center all** centers every
   area horizontally. Both preserve sizes, vertical positions and capture order.
   You can also remove an area or move it earlier in capture order.
4. Choose the frame position: **Above photos** for PNG frames with transparent
   holes; **Behind photos** for JPEGs and opaque PNGs whose photo areas will be covered.
5. Select **Try sample photos** to check crops and layers. These samples are
   locally drawn placeholders and are not saved as photographs.
6. Give the template a name and choose **Save & use template**.

## Zoom and navigation

- Scroll the mouse wheel or use a trackpad over the canvas to zoom toward the pointer.
  Scrolling elsewhere in the editor continues to scroll the editor normally.
- Use **−** and **+** for zoom buttons. The percentage is relative to the fitted
  view, from 50% to 400%. **Fit** shows the entire frame again.
- Choose **Hand**, then drag to move around the enlarged frame, or middle-drag
  while using either tool. Choose **Edit** to move, resize or draw photo areas.
- The canvas also has scrollbars. When it has keyboard focus, use **+**, **−**,
  and **0** for zoom in, zoom out and Fit.
- Zoom changes only the editing view. It does not change template dimensions,
  photo-area percentages, sample crop behavior or export resolution.

Each new session uses four photos. Photos fill the marked areas in numbered
order with centered cropping. If capture stops early, finish the remaining
photos from review before saving. The included Doodle template remains available.
Older custom frames with fewer openings can be opened from the Studio template
picker to add photo areas. Guests see them once they have four areas and the
organizer enables them.

Templates work offline and remain in the dropdown after restarting. The last
selection is remembered on the device. In the template picker, use the three-dot
button beside a custom template to show **Edit** and **Remove**. Editing reopens
its name, photo areas, and tilt; **Save changes** updates that template. To replace
the artwork itself, import a new frame. Removal asks for confirmation and keeps
finished photo strips intact. Template management is disabled during capture or
while a strip is waiting to be saved. The built-in Doodle frame is protected.

## Storage and limits

- PNG and JPEG files up to 10 MB; each side must be 128–4096 pixels, at most 16 MP.
- New capture templates need four rectangular photo areas inside the frame.
- Import normalizes JPEG and PNG inputs to PNG so transparency can be preserved.
- Template PNGs live in `library/templates/`; names, dimensions, slots, layers,
  and small previews live in the SQLite `templates` table (schema version 4).
- Up to 50 local templates are supported. Removing one makes room for a new import.
- The imported frame size determines the final JPEG dimensions.
- Captures still stay in RAM. Only the completed strip is saved as a photo file.
- A capture session retains its chosen template through saving and failed-save retries.
- Saved strips retain their composite thumbnail; selecting another template does
  not change strips already saved.

## Validation

Template tests cover transparent-opening detection, white-box detection, outside
border rejection, moving/resizing bounds and anchored edges, selected/all horizontal
centering, embedded-image validation, output dimensions, photo
cropping, layer order, and partial sessions. The Electron storage test covers
template persistence after reopening, session slot limits and template locking,
and existing strip-only saving and legacy-photo preservation.

The template controls appeared in the running app, but full import and capture
through the UI were not manually verified: the user stopped Computer Use with Escape.
No real webcam capture or user template import was performed during testing.
