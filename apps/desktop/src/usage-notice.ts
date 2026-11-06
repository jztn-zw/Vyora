export const NOTICE_REVISION = '2026-11-02.1';
export const NOTICE_STORAGE_KEY = 'vyora.notice-acceptance';

export const usageNotices = [
  {
    title: 'Testing terms',
    paragraphs: [
      'You may install and use this build to test VYORA and share feedback. This testing permission does not grant permission to sell VYORA, sublicense it, or present it as your own software. Third-party components remain subject to their own licenses.',
      'You keep the rights you already have in your photos and imported artwork. Use only images you have permission to use, and explain the booth’s photo handling to participants before taking their pictures. Accepting these terms does not give VYORA permission to publish your photos.',
      'This build is provided for evaluation without a promise of uninterrupted or error-free operation. Test your camera, storage, and printer before an event, and keep separate backups of important photos. Nothing here limits rights that applicable law does not allow to be limited.',
    ],
  },
  {
    title: 'Privacy & local storage',
    paragraphs: [
      'VYORA uses your selected camera when you enable it. New individual captures and retakes stay in memory until you confirm and save the finished strip. Closing VYORA before saving loses those unsaved photos. Older libraries may still contain individual photo files from earlier versions.',
      'If you choose tethered capture, VYORA exchanges live previews, shutter commands and original JPEGs with digiCamControl on this computer. digiCamControl and your camera may save individual originals separately from VYORA. Check their storage and network-access settings; VYORA does not delete those copies. Stopping a session cannot undo a shutter command already sent to the camera.',
      'Saved strips, thumbnails, imported frames, library records, settings, print queue records, and your notice acceptance are stored on this computer. The acceptance record contains the notice revision, app version, and acceptance time. It is not sent to a server.',
      'This build has no online photo upload, cloud backup, analytics, or automatic feedback submission. Anyone with access to your Windows account, local files, or synced folders may be able to access your saved data. VYORA does not encrypt its library.',
      'If you enable a guest display, VYORA shows live camera previews and the current session’s photos on that display. Enabling device access starts a local network server. Only browsers you pair and approve can view the session and use permitted guest controls. This local HTTP connection is not encrypted; use a private network you trust. Disconnect a browser or stop device access to revoke its connection. Guest browsers may temporarily cache displayed images. No cloud upload is needed for this feature.',
      'Printing sends the selected images to Windows and the chosen printer or PDF driver. External camera software, printer services, and any folder-sync or backup software you use have their own data handling. Only send photos or screenshots with feedback when you have permission to share them.',
      'Saved strips remain until you remove them. Deleting a strip through VYORA moves its image to the Windows Recycle Bin; library metadata and thumbnails may remain, and this is not secure erasure. Uninstalling is not a data-deletion tool. For questions about event photos or requests to access or remove them, contact the person operating the booth.',
    ],
  },
  {
    title: 'Before you start testing',
    paragraphs: [
      'This is an early testing version. Features may change, and camera, printing, or saving problems may occur. Check that each strip saves successfully and measure a test print before relying on a printer setup.',
      'There is no automatic online backup. Keep your own copies of important strips. To report a problem, contact the person who provided this build and include the app version, what you were doing, and any error message. VYORA does not send reports automatically.',
    ],
  },
] as const;

export function hasAcceptedNotice(storage: Pick<Storage, 'getItem'>) {
  try {
    const record = JSON.parse(storage.getItem(NOTICE_STORAGE_KEY) || 'null');
    return (
      record?.revision === NOTICE_REVISION &&
      typeof record.appVersion === 'string' &&
      typeof record.acceptedAt === 'string' &&
      Number.isFinite(Date.parse(record.acceptedAt))
    );
  } catch {
    return false;
  }
}

export function acceptNotice(
  storage: Pick<Storage, 'setItem'>,
  appVersion: string,
) {
  storage.setItem(
    NOTICE_STORAGE_KEY,
    JSON.stringify({
      revision: NOTICE_REVISION,
      appVersion,
      acceptedAt: new Date().toISOString(),
    }),
  );
}
