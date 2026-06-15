import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';

export function setupAutoUpdater(getWindow: () => BrowserWindow | null) {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('update-downloaded', async (info) => {
    const win = getWindow();
    const result = win
      ? await dialog.showMessageBox(win, {
          type: 'info',
          title: 'Update ready',
          message: `Papyrus Client ${info.version} is ready to install.`,
          detail: 'Restart the launcher to finish updating.',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        })
      : await dialog.showMessageBox({
          type: 'info',
          title: 'Update ready',
          message: `Papyrus Client ${info.version} is ready to install.`,
          detail: 'Restart the launcher to finish updating.',
          buttons: ['Restart now', 'Later'],
          defaultId: 0,
          cancelId: 1,
        });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.on('error', (error) => {
    console.warn('[papyrus-client] update check failed:', error.message);
  });

  setTimeout(() => {
    void autoUpdater.checkForUpdates().catch(() => undefined);
  }, 5000);
}
