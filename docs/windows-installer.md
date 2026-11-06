# Windows setup wizard

Run `npm run make:desktop` from the repository root. The Windows x64 installer is
`apps/desktop/out/make/VYORA-0.1.0-Setup.exe` (the filename follows the app version).
Share that single file through Google Drive. Testers download it and run it on
Windows, then follow the wizard. The green Squirrel animation is no longer used.

To enable **Download for Windows** on the website, stage the installer from the workspace root before starting Vite or building the client.

```powershell
New-Item -ItemType Directory -Path 'apps/client/public/downloads' -Force | Out-Null
Copy-Item -LiteralPath 'apps/desktop/out/make/VYORA-0.1.0-Setup.exe' -Destination 'apps/client/public/downloads/'
```

The staged executable is a local build artifact. The website shows the setup guide as the primary action when the installer is absent. When the release version changes, match the filename in `apps/client/vite.config.ts` to the staged file.

The NSIS wizard provides:

- A VYORA welcome page with the existing approved artwork.
- Testing terms, privacy and testing notices before installing, using the same
  notice revision and paragraphs as the in-app screen. Accept or cancel.
- Current-user / all-user install options from NSIS, where permissions permit.
- A destination directory page, with a current-user location as the default.
- A desktop shortcut checkbox. The Start menu shortcut is always created.
- Installation progress and a completion page with a Launch VYORA checkbox.
- An uninstall entry in Windows Settings.

It is a full offline installer, not an installer that downloads VYORA at install
time. Normal per-user installation requires no administrator access. Selecting
protected locations may require permissions the current account does not have.
The installer is unsigned, so Windows may show an unknown-publisher warning.

`forge.config.mts` configures `electron-forge-maker-nsis`. Custom wizard text and
the shortcut page live in `installer/vyora.nsh`. Existing NSIS install, upgrade,
file-lock and uninstall logic is retained. It does not delete the user's photo
library or app profile on uninstall. Generated terms and formatted artwork are
under `out/installer-assets`; terms are generated from `src/usage-notice.ts` on
each package build so copies do not drift. Notice acceptance in the app stays
local to its profile, and the first-launch acknowledgement still appears.

## Existing Squirrel testers

The NSIS installer does not automatically uninstall an older Squirrel build.
Close the old app and uninstall its old VYORA entry through Windows Settings
before installing this wizard build. Keep a separate backup of important strips.
The app keeps the same user-data path and Windows app ID to preserve the library
and settings. An old Squirrel Setup.exe may still be present in a prior build's
`out/make/squirrel.windows/x64` directory; share only the new file directly under
`out/make`. Never delete the photo library as part of switching installers.

NSIS and this maker are free tools. Pre-install testing terms remain testing
terms, not a commercially reviewed license agreement. No online auto-update or
code-signing service is configured by this change.
