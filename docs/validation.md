# Foundation validation

## Full-sheet printing update — November 1, 2026

- `npm run test:printing`: 40 passing tests, including 19 full-sheet tests for
  fixed physical sizes, rotated placement, used/blocked areas, custom limits,
  persistent queues, request replay, disk failures, restart recovery, uncertain
  jobs, and native page-size options. Printer and native callback tests are
  simulated; no physical print jobs were sent.
- `npm run test:strips`: 4 passing tests.
- `npm run test:templates`: 11 passing tests.
- `npm run test:retakes`: 4 passing tests.
- `npm run typecheck`, `npm run lint`, and `npm run format:check`: passed.
- Vite production builds for desktop renderer, main, and preload: passed in
  separate `.vite/sheet-*-check` output directories.
- No live UI inspection or physical-printer calibration is claimed for this
  update. Automatic approval review blocked the earlier live-app check because
  of a usage cap. Actual paper feed, driver scaling, printable margins, and
  supported custom media still require a test on the intended printer.

The foundation results below describe the earlier validation run.

Validated on October 31, 2026, using Windows x64, Node.js 22.20.0, and npm 10.9.3.

## Passed

- `npm run typecheck`: desktop and viewer TypeScript checks.
- `npm run lint`: configured correctness checks, with warnings treated as failures.
- `npm run format:check`: formatting checks.
- `npm run build:viewer`: viewer production build.
- `npm run test:storage`: actual Electron SQLite runtime; saved original JPEG bytes,
  inserted metadata, invalid-image rejection, and persistence after closing and reopening.
- `npm run make:desktop`: final Windows package, Squirrel installer, and ZIP.
- Packaged archive inspection: compiled main included; no development data, SQLite
  library files, or environment files included.
- `npm audit --omit=dev`: zero reported runtime dependency vulnerabilities.
- Desktop process launched with a synthetic camera flag, without startup exceptions.
- Local viewer reached in Chrome; expected title and setup-state content confirmed.

## Limitations

- Desktop visual inspection timed out while waiting for app access. The browser
  screenshot request also timed out. No visual-QA pass or screenshot is claimed.
- End-to-end countdown and camera capture were not verified through the UI.
- No real webcam, DSLR, camera disconnect, low-disk, or long-running event test was performed.
- Installer generation passed; installing it on a clean Windows machine is still required.
- The full npm audit reports 19 moderate findings in development/packaging dependencies.
  The vulnerable formatter was updated, removing the critical findings. No forced
  dependency downgrades or incompatible transitive overrides were applied.
- Cloud uploads, account access, QR sharing, and online gallery retrieval are not implemented.
- The viewer is a local starter; there is no deployed website or provisioned cloud database.
- Complete machine-offline operation of the packaged application remains a manual release check.

The development previews were stopped after checks. Run the documented development
commands to reopen them. The generated installer is unsigned and is a development artifact.
