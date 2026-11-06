# First-launch testing notices

VYORA shows testing terms, a privacy/local-storage notice, and a testing notice
before mounting the studio. The camera and library UI cannot be used until the
unchecked agreement checkbox is selected and **Accept & continue** is pressed.
**Decline & exit** closes the window. The NSIS setup wizard also shows these same
notices before installation. The in-app acceptance remains separate and local to
the Windows app profile; see [Windows installer](windows-installer.md).

The source text and revision live in `apps/desktop/src/usage-notice.ts`. Acceptance
is local to the Windows app profile: notice revision, app version, and timestamp
under `vyora.notice-acceptance`. A new notice revision requires acceptance again;
clearing local app storage also resets it. There is no server record or signature.
If storage fails, the user can explicitly continue for that session after reading
the warning; the next launch asks again. **Studio tools → Terms & privacy** reopens
the same text without changing the acceptance record.

The text describes the current testing build, not planned cloud features. It
mentions RAM-only unsaved captures, saved JPEGs/metadata, local acceptance data,
printer/third-party services, no photo upload/analytics/automatic feedback,
unencrypted local files, backups, and the limits of deletion. It does not promise
secure erasure or automatic cloud backup.

These are private testing terms, not a reviewed public commercial EULA. Before
public distribution, review the actual publisher identity/contact details,
distribution rights, dependency licenses, applicable local requirements, and event
operators' responsibilities with qualified counsel. A software operator's
acceptance is not consent from the people photographed. Add an appropriate event
notice and contact route for participants when using VYORA at an event.

Privacy drafting reference: the Philippine National Privacy Commission's
[right to be informed guidance](https://privacy.gov.ph/the-right-to-be-informed/)
explains that notices should describe actual personal-data processing. This
implementation does not claim to establish legal compliance.

Validation: `node --test tests/usage-notice.test.mjs` from the desktop directory
checks acceptance revision/storage behavior. `tests/editor-ui-smoke.cjs` checks the
first-launch gate, decline, checkbox, local persistence and reopening the notice.
