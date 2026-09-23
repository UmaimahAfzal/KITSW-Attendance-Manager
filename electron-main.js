const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');const path = require('node:path');

let mainWindow;
let localServer;
ipcMain.handle('print-to-pdf', async () => {
  if (!mainWindow) {
    throw new Error('Application window is not available.');
  }

  const pdfData = await mainWindow.webContents.printToPDF({
    printBackground: true,
    landscape: true,
    pageSize: 'A4'
  });

  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Attendance Report',
    defaultPath: 'KITSW Attendance Report.pdf',
    filters: [
      { name: 'PDF Files', extensions: ['pdf'] }
    ]
  });

  if (canceled || !filePath) {
    return { canceled: true };
  }

  const fs = require('node:fs');
  fs.writeFileSync(filePath, pdfData);

  await shell.openPath(filePath);

  return { canceled: false, filePath };
});
function startLocalServer() {
  return new Promise((resolve, reject) => {
    // Keep the writable SQLite database outside the packaged app.
    process.env.KITSW_DATA_DIR = path.join(app.getPath('userData'), 'data');
    process.env.PORT = '0';

    try {
      localServer = require(path.join(__dirname, 'server.js')).server;

      // Wait until the server has actually started listening.
      if (localServer.listening) {
        const port = localServer.address().port;
        resolve(`http://127.0.0.1:${port}`);
        return;
      }

      localServer.once('listening', () => {
        const port = localServer.address().port;
        resolve(`http://127.0.0.1:${port}`);
      });

      localServer.once('error', reject);
    } catch (error) {
      reject(error);
    }
  });
}

async function createWindow() {
  try {
    const url = await startLocalServer();

    mainWindow = new BrowserWindow({
      width: 1500,
      height: 950,
      minWidth: 1100,
      minHeight: 700,
      show: true,
      autoHideMenuBar: true,
      backgroundColor: '#f7f2ec',
      icon: path.join(__dirname, 'assets', 'kitsw_attendance_manager.ico'),
      webPreferences: {
  contextIsolation: true,
  nodeIntegration: false,
  devTools: false,
  preload: path.join(__dirname, 'preload.js')
}
    });

    mainWindow.removeMenu();

    await mainWindow.loadURL(url);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

  } catch (error) {
    console.error(error);

    dialog.showErrorBox(
      'KITSW Attendance Manager',
      `The application could not start.\n\n${error.message}`
    );

    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch {}
  }

  app.quit();
});

app.on('before-quit', () => {
  if (localServer) {
    try {
      localServer.close();
    } catch {}
  }
});