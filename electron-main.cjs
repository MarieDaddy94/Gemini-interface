const { app, BrowserWindow } = require('electron');
const path = require('path');

// Disable GPU and sandbox in CI/headless environments
if (process.env.CI) {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch('no-sandbox');
}

let mainWindow;

function isDevMode() {
  // Development mode when explicitly set or when VITE_DEV_SERVER_URL is provided
  return process.env.NODE_ENV === 'development' && process.env.VITE_DEV_SERVER_URL;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      // Enable internet access (standard Electron behavior)
      allowRunningInsecureContent: false,
    },
  });

  // In development, load from Vite dev server
  // In production, load from built files
  if (isDevMode()) {
    const viteDevUrl = process.env.VITE_DEV_SERVER_URL;
    mainWindow.loadURL(viteDevUrl);
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked and no windows are open
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
