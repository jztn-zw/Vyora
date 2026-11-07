# Printing photo strips

Install your printer and its Windows driver first. VYORA lists the printers
Windows has installed; an installed entry is not proof the printer is powered on,
has paper, or supports a particular cut size.

## Setup

1. Open **Tools → Printer settings** in VYORA's header. The list refreshes on opening, returning
   focus to VYORA, or clicking **Refresh**.
2. Select your printer. VYORA does not silently select a default printer.
3. Choose **Photo printer** for immediate printing, then its paper layout:
   - **Auto fit:** 4 × 6-inch paper. Narrow portrait strips (width up to 40%
     of their height) print two copies per sheet. Wider frames print one copy
     per sheet, with landscape artwork rotated to fit the paper.
   - **Narrow paper:** one copy fitted to 2 × 6-inch paper, requiring a
     compatible printer and driver.
     Choose **Full sheets** for long bond, A4, Letter, or supported measured pieces;
     use the sheet workflow below instead of sheets per print.
4. Choose 1–10 **sheets per print** and save the settings. The saved photo
   preview shows the fitted size and number of copies per sheet.
5. Match the paper size and desired borderless/cutting mode in the manufacturer's
   Windows driver. Run one test print and measure the result before event use.

Printer selection, layout, and sheet count are stored in `printer-settings.json`
beside the active desktop library directory. Development and packaged settings
remain isolated. Settings are validated and replaced atomically; a damaged or
unreadable file requires explicit setup again.

## Printing

Capture, review/retake, then **Confirm & save strip**. The saved preview opens
with **Print photo**. Library previews offer the same action. Legacy sessions
must be saved as a finished strip before printing.

The print uses the saved, full-resolution JPEG, including the selected frame and
VYORA artwork. The complete design fits in the assigned space, with white space
where the design and paper have different proportions. For example, Auto fit
prints a square as 4 × 4 inches on a 4 × 6-inch sheet. The printer receives a
single-sided page with the selected sheet count.

No job is sent while opening settings, saving photos, or viewing strips. After a
successful submission, **Print another** explicitly submits another job. Closing
the preview does not cancel a job already sent to Windows.

## Ordinary printers and full sheets

1. Open **Tools → Printer settings**, select the installed printer, choose **Full sheets**, then
   **Save & arrange paper**. **Tools → Paper & layout** reopens the layout.
2. Choose **New sheet / leftover**, name the physical sheet, and select long bond
   (8.5 × 13 inches), A4, or Letter. Enter the margin on each edge and gap between
   strips. The defaults are a starting point, not measured printer capabilities.
3. Open saved strip previews and choose **Add to sheet**. Different sessions and
   copies share the persistent queue. Adding, saving, and reopening never print.
4. For paper that already has ink, select its matching saved record. Use **Mark
   used space** to drag rectangles or enter their dimensions from the left/top
   physical edges. Printed and spoiled positions are remembered automatically
   after you confirm the outcome. Manual marks can be undone; recorded printed
   positions cannot be cleared. Marks and preview labels do not print.
5. The preview arranges photos at their fitted sizes, including rotated photos.
   New entries fit into a 2 × 6-inch box for narrow strips or a 4 × 6-inch box
   for other designs, using their original proportions. Existing queued entries
   retain their 2 × 6-inch boxes. Entries that do not fit stay queued. Optional
   cutting guides sit outside the photos and require at least 2 mm of gap and margin.
6. Load that exact physical sheet in the shown direction, confirm the checkbox,
   and choose **Print sheet**. You may print a partly filled layout; VYORA does
   not automatically send a job when the sheet becomes full.
7. Check the physical print and Windows queue. Choose **Printed correctly** to
   mark the reserved areas used and remove those queue entries. **Nothing
   printed** keeps the entries and frees the positions. **Areas spoiled** keeps
   entries for reprinting and marks all reserved positions used conservatively.

The physical page is sent at the selected sheet dimensions with the sizes shown
in the arrangement preview. Match the
driver's paper size, orientation, actual-size scaling and printable margins.
Print one test, measure the boxes, and adjust the driver/margins before an event.
Drivers can impose scaling or reject media sizes; the app cannot guarantee a
physical result without this calibration.

For a rectangular leftover, first verify that the printer's manufacturer supports
feeding that size and media. In Printer settings, expand **Custom paper and
leftover support**, confirm verified limits, and enter the supported minimum and
maximum width/length for that printer and feed orientation. Then create a new
**Measured piece** with the actual remaining dimensions. These are operator
limits, not capabilities discovered from the driver. A piece outside the limits
is rejected. A 2 × 6-inch piece with nonzero margins cannot fit a complete 2 ×
6-inch strip. Use only manufacturer-supported pieces; arbitrary scraps or
irregular cutouts are not supported.

Paper records, queue entries, request identifiers, reservations and outcomes are
stored atomically in `paper-state.json` beside the library data. Reservations are
saved **before** native submission. Restarting changes unresolved jobs to a
check-required state without sending them again. Do not reuse their positions
until you inspect the paper and Windows queue. An unreadable record file or a
failure saving an outcome disables sheet printing instead of forgetting used
areas. Preserve damaged records for recovery. Discarding a record only deletes
its bookkeeping; it does not make the physical paper blank.

Limits: 100 queued entries, 40 paper records, 100 retained batch/request records,
100 marked/used rectangles per paper, and 16 strips per print. The placement
search is bounded and does not promise the mathematically optimal packing.

## Recovery and limitations

- A missing saved printer stays selected. Refresh or explicitly choose another;
  VYORA never falls back to an unrelated installed printer.
- Preparation times out after 15 seconds; Windows printer enumeration has a
  5-second deadline. Late preparation results cannot send a job.
- Jobs are serialized. Repeated requests with the same ID reuse the existing
  result (bounded to the latest 100 requests during the current app run).
- A missing native response after 60 seconds is **uncertain**. The job stays
  locked while VYORA waits for the actual callback. No automatic retry occurs.
- If a full-sheet print worker is lost after submission, check the physical sheet
  and Windows queue, then resolve its result in Paper & layout. For immediate
  photo-printer jobs, check the queue before reopening VYORA and printing again.
  Restarting never resumes jobs automatically.
- **Sent to printer** confirms submission only. Offline queues, jams, paper/ribbon
  levels, completed physical copies, borderless support, and cutting are managed
  by the printer and Windows driver. VYORA does not control a hardware cutter.

Automated tests use simulated printers, controlled native callbacks, and isolated
settings files. A real printer calibration test is still required for each printer,
driver, media size, and cutter configuration.

The implementation uses Electron's documented
[printer listing and printing API](https://www.electronjs.org/docs/latest/api/web-contents#contentsprintoptions-callback).
