const { app, BrowserWindow, dialog } = require('electron');
const path = require('node:path');

let mainWindow;
let localServer;

function startLocalServer() {
  // Keep the writable SQLite database outside the packaged app.
  process.env.KITSW_DATA_DIR = path.join(app.getPath('userData'), 'data');
  process.env.PORT = '0';

  localServer = require(path.join(__dirname, 'server.js')).server;
  const port = localServer.address().port;
  return `http://127.0.0.1:${port}`;
}

async function createWindow() {
  try {
    const url = startLocalServer();

    mainWindow = new BrowserWindow({
      width: 1500,
      height: 950,
      minWidth: 1100,
      minHeight: 700,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#f7f2ec',
      icon: path.join(__dirname, 'assets', 'kitsw.ico'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        devTools: false
      }
    });

    mainWindow.removeMenu();
    await mainWindow.loadURL(url);
    mainWindow.once('ready-to-show', () => mainWindow.show());

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (error) {
    console.error(error);
    dialog.showErrorBox('KITSW Attendance Manager', `The application could not start.\n\n${error.message}`);
    app.quit();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (localServer && !localServer.listening) return;
  if (localServer) {
    try { localServer.close(); } catch {}
  }
  app.quit();
});

app.on('before-quit', () => {
  if (localServer) {
    try { localServer.close(); } catch {}
  }
});
