# VYORA paper-saving plan

Status: the first implementation now includes Full sheets mode, fixed 2 × 6-inch
placement, long bond/A4/Letter presets, measured custom pieces with verified
printer limits, manual used-area marking, a durable multi-session queue, and
operator-confirmed print outcomes. See [printing instructions](printing.md).
Automatic printing when full and smallest-remainder recommendations remain
proposals. The sections below preserve the broader design rationale and ideas.

## Objective

Keep every finished strip at 2 × 6 inches while using available blank paper
efficiently. Support a fresh sheet, unused areas on an intact sheet, and a cut
rectangular remainder when the specific printer supports feeding that remainder.
Keep the normal photo capture/review flow simple.

The app can remember paper records and requested layouts. It cannot inspect ink,
measure the loaded paper, identify which saved sheet is in the tray, or prove that
a print physically completed. The operator supplies those facts.

## What existing software demonstrates

- Breeze Hotfolder provides print-layout controls for position, margins, and
  spacing, plus test prints for checking alignment. This is a suitable foundation
  for placing strips accurately; its documentation does not establish automatic
  identification of partially used paper.
  [Breeze layout documentation](https://manuals.breezesoftware.com/Hotfolder/help/custom_layout.htm)
- Microsoft's documented Publisher workflow distinguishes the design's page size
  from the physical sheet size. It supports multiple items per sheet and a chosen
  starting row/column. This illustrates reusing positions; it is a workflow
  reference, not a recommendation to adopt Publisher.
  [Microsoft printing documentation](https://support.microsoft.com/en-us/publisher/print-a-publication)
- HP SmartStream documents nesting multiple pages on a sheet with margins, gaps,
  alignment, and optional cutting lines. That is comparable professional print
  layout software, not evidence that photo booth apps detect old ink or offcuts.
  [HP SmartStream documentation](https://support.hp.com/us-en/document/ish_13050726-13050630-16)

Our additional idea is to combine fixed-size strip placement with saved paper
records, a durable strip queue, and recommendations for the smallest usable
remainder. These are proposed VYORA features, not claims about competitor features.

## Three paper choices

| Choice            | Operator supplies                                                                          | Proposed behavior                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| New sheet         | Paper preset or measured width/height                                                      | Arrange queued strips inside the calibrated printable area.                        |
| Partly used sheet | The matching saved sheet, or manually marked used areas                                    | Keep its physical size; place new strips only in confirmed blank areas.            |
| Leftover piece    | Actual remaining width/height, supported media profile, feed direction, and any used areas | Treat the piece as a new custom-size sheet, never as the original long bond sheet. |

A cut changes the paper's dimensions and often its coordinate origin. Selecting
"I cut this sheet" should create new measured remainder records and retire the
old sheet record. Version one should require remeasuring/reviewing the remainder
rather than guessing the cut's location or transferring old coordinates silently.

Only enable leftover printing for supported rectangular media. Model-specific
minimum dimensions, margins, media type, paper source, and refeeding restrictions
must be recorded and calibrated first. A rectangle fitting the screen is not proof
that the printer can feed it. Epson documents model-specific custom-size limits;
some HP printer instructions explicitly discourage hand-cut sheets.
[Epson custom-size guidance](https://www.epson.hu/faq/KA-01554/contents?loc=en-us),
[HP paper-loading guidance](https://support.hp.com/au-en/document/ish_6883335-7759872-16)

If the printer's requirements are unknown or prohibit the remainder, keep the
layout available for planning but disable printing that piece. Do not suggest
taping scraps to carrier sheets or forcing undersized pieces through a feeder.

## Proposed user flow

1. Capture, review/retake, and save the finished strip as today.
2. Choose **Add to print sheet**. Queue only saved strips, and let the operator
   choose the number of strip copies rather than confusing it with sheet copies.
3. Open a **Paper & layout** modal from the preview or Printer settings. Choose
   **New sheet**, **Partly used sheet**, or **Leftover piece**.
4. Show the actual physical paper as a preview: blank areas, blocked/used areas,
   queued strip thumbnails, paper dimensions, and a feed-direction arrow. Marks
   for used/blocked areas are screen-only and are never printed.
5. Offer **Arrange automatically** to pack the queue, with individual placement
   adjustment when needed. Show the exact count that fits; never shrink strips
   to make extra copies fit.
6. Show a recommendation such as "This saved leftover piece can fit your next
   strip." The operator chooses which piece is actually loaded; the app must not
   silently switch between physical paper records.
7. **Print sheet** submits the selected layout once. **Keep filling** leaves it
   queued. **Print now** can print a partly filled layout when guests cannot wait.
8. Keep submitted positions occupied until the operator checks the result.
   **Printed correctly** records them as used. A jam, missing sheet, or uncertain
   result opens a paper check rather than automatically freeing or reprinting
   those positions.
9. If usable paper remains after cutting, **Keep leftover** records its actual
   dimensions and supported paper profile for later use.

Example: a measured 4 × 7-inch rectangular remainder could hold one 2 × 6-inch
strip if the selected printer accepts that paper size and the printable margins
leave sufficient room. A 2 × 6-inch remainder may fail the same test because its
edges leave no room for a non-borderless printer's margins.

## Placement and paper-saving rules

- Store physical measurements as integer microns. The strip rectangle is always
  50,800 × 152,400 microns; rotate by 90 degrees only when it improves placement.
- Keep paper feed orientation explicit even when an individual strip is rotated.
- Subtract the printer profile's margins, calibrated offsets, used rectangles,
  reserved rectangles, and cutting clearance before placing strips.
- Start with a deterministic grid/rectangle-placement algorithm suited to equal
  strip sizes. Validate every placement independently on the main-process side.
- Reject overlap, out-of-bounds placement, unsupported paper dimensions, and
  hidden scaling. Fit the complete strip artwork inside its fixed rectangle;
  preserve the logo and frame. Different artwork aspect ratios may retain white
  space inside the rectangle.
- Prefer the smallest compatible saved piece that fits the requested strips as a
  suggestion. Never identify paper or choose a physical piece automatically.
- Calculate capacity from the actual usable area and gaps. Do not promise a fixed
  number of strips for long bond paper regardless of printer margins.
- Offer optional cutting guides outside the strip artwork, only where they fit
  inside the printable area. Default them off for existing photo-printer layouts.
- A full sheet becomes **Ready to print**. Automatic printing of a full layout
  should be a later opt-in feature after the loaded-paper workflow is verified.

## Queue, paper records, and recovery

Persist saved-strip references, requested copies, paper dimensions, orientation,
used/blocked rectangles, printer-profile revision, and layout reservations. The
queue and paper history should survive restart; restarting must never resume
printing automatically.

Reserve the chosen paper and positions transactionally before sending a job.
Freeze the batch's saved image IDs, placements, paper size, and printer settings
so subsequent UI edits cannot change an in-flight print. Mixed sheets require one
composed document containing all selected strips, not separate jobs per strip.

Release reservations on a definite failure before submission. After submission,
retain them until the operator verifies the paper, including when Windows reports
an error: software status alone does not establish whether ink reached the paper.
Keep the current protections for serialized jobs, request tokens, unavailable
printers, and uncertain native callbacks. Extend request tracking to durable batch
records without promising exactly-once physical output.

Manual corrections must be possible: mark an area used, block an uncertain area,
or create a replacement sheet record. Clearing a used area should explicitly mean
the operator has verified it is blank. Never clear history just because the print
preview closed or another paper preset was selected.

## Implementation sequence

1. **Full sheets and batch queue:** separate physical paper size from strip size;
   add long bond, A4/Letter, and supported custom-size profiles; compose different
   saved strips into one page; persist queue and offer manual Print sheet.
2. **Intact partly used sheets:** add named paper records, used-area marking,
   print reservations, a feed-orientation preview, and post-print paper checks.
3. **Supported leftovers:** add measured custom-size pieces, printer-specific
   minimum/maximum dimensions and source restrictions, and calibration. Enable
   this only after the actual printer model is known and tested.
4. **Optional refinements:** recommend compatible saved remainders, show usable
   capacity before queuing, and optionally print full layouts automatically once
   the loaded-paper behavior is dependable.

Retain the existing 2 × 6 and two-up 4 × 6 workflow for photo printers. Reuse mode
must not assume roll-fed dye-sublimation printers accept loose cut remnants.

## Validation before release

- Geometry: actual 2 × 6-inch boxes, both rotations, gaps, printer margins,
  used-area avoidance, exact boundary cases, and pieces too small to print.
- Persistence: queue/order/copy counts and paper records across restart, atomic
  reservations, interrupted writes, profile changes, and obsolete paper geometry.
- Job lifecycle: double clicks, replayed requests, competing batches, failures
  before submission, unknown outcomes after submission, and no automatic replay.
- UI: selecting the loaded sheet, marking blocked areas, numeric units, keyboard
  operation, compact preview, and themed scrollbars inside modal radii.
- Hardware: ruler-measured strip width/height, feed orientation, registration after
  refeeding, paper-source selection, printer scaling, and approved offcut handling.

Printer model, driver, accepted media sizes/types, and calibrated printable margins
are the remaining hardware inputs. Software cannot infer them reliably from the
detected printer name alone. Full-sheet planning can proceed independently; offcut
printing must wait for a supported, tested printer profile.
