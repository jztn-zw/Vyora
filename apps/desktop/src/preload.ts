import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '@vyora/shared';

const api: DesktopApi = {
  connectTetheredCamera: (port) =>
    ipcRenderer.invoke('camera:tethered-connect', port),
  readTetheredPreview: (port) =>
    ipcRenderer.invoke('camera:tethered-preview', port),
  captureTetheredPhoto: (port, serial, requestId, recoveryMs) =>
    ipcRenderer.invoke('camera:tethered-capture', {
      port,
      serial,
      requestId,
      recoveryMs,
    }),
  guestStatus: () => ipcRenderer.invoke('guest:status'),
  guestConfigure: (input) => ipcRenderer.invoke('guest:configure', input),
  guestPublish: (state) => ipcRenderer.invoke('guest:publish', state),
  guestPreview: (jpeg) => ipcRenderer.invoke('guest:preview', jpeg),
  onGuestCommand: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      command: Parameters<typeof callback>[0],
    ) => callback(command);
    ipcRenderer.on('guest:command', listener);
    return () => {
      ipcRenderer.removeListener('guest:command', listener);
    };
  },
  guestReply: (requestId, error) =>
    ipcRenderer.send('guest:reply', { requestId, error }),
  guestRead: () => ipcRenderer.invoke('guest:read'),
  guestSend: (command) => ipcRenderer.invoke('guest:send', command),
  guestReadPreview: () => ipcRenderer.invoke('guest:read-preview'),
  getPaperState: () => ipcRenderer.invoke('paper:state'),
  addToPrintSheet: (id, requestId, copies = 1) =>
    ipcRenderer.invoke('paper:add', { id, requestId, copies }),
  removeFromPrintSheet: (queueId) =>
    ipcRenderer.invoke('paper:remove', queueId),
  createPrintPaper: (name, spec) =>
    ipcRenderer.invoke('paper:create', { name, spec }),
  selectPrintPaper: (paperId) => ipcRenderer.invoke('paper:select', paperId),
  markPrintPaper: (paperId, revision, blocked) =>
    ipcRenderer.invoke('paper:mark', { paperId, revision, blocked }),
  deletePrintPaper: (paperId) => ipcRenderer.invoke('paper:delete', paperId),
  printSheet: (paperId, revision, requestId, loaded) =>
    ipcRenderer.invoke('paper:print', { paperId, revision, requestId, loaded }),
  resolveSheetPrint: (batchId, result) =>
    ipcRenderer.invoke('paper:resolve', { batchId, result }),
  getPrintActivity: () => ipcRenderer.invoke('printer:activity'),
  getPrinterState: () => ipcRenderer.invoke('printer:state'),
  savePrinterSettings: (settings) =>
    ipcRenderer.invoke('printer:settings', settings),
  printStrip: (id, requestId) =>
    ipcRenderer.invoke('printer:print', { id, requestId }),
  setTheme: (theme) => ipcRenderer.invoke('window:theme', theme),
  getLibrary: () => ipcRenderer.invoke('library:read'),
  stagePhoto: (jpeg, sessionId, templateId) =>
    ipcRenderer.invoke('session:capture', { jpeg, sessionId, templateId }),
  replacePhoto: (jpeg, sessionId, photoId) =>
    ipcRenderer.invoke('session:replace', { jpeg, sessionId, photoId }),
  listTemplates: () => ipcRenderer.invoke('template:list'),
  getTemplate: (id) => ipcRenderer.invoke('template:read', id),
  saveTemplate: (template) => ipcRenderer.invoke('template:save', template),
  updateTemplate: (id, template) =>
    ipcRenderer.invoke('template:update', { id, template }),
  removeTemplate: (id) => ipcRenderer.invoke('template:remove', id),
  getStripSources: (id) => ipcRenderer.invoke('strip:sources', id),
  getStripPreview: (id) => ipcRenderer.invoke('strip:preview', id),
  deleteStrip: (id) => ipcRenderer.invoke('strip:delete', id),
  saveStrip: (id, jpeg, reveal = false) =>
    ipcRenderer.invoke('strip:save', { id, jpeg, reveal }),
  openStrip: (id) => ipcRenderer.invoke('strip:open', id),
  openLibrary: () => ipcRenderer.invoke('library:open'),
};

contextBridge.exposeInMainWorld('vyora', api);
