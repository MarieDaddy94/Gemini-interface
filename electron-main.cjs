const { app, BrowserWindow, protocol } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');

// Check if we have a dist folder with the built app
const distPath = path.join(__dirname, 'dist', 'index.html');
const isDev = !fs.existsSync(distPath) || process.env.ELECTRON_DEV === 'true';

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 800,
    backgroundColor: '#131722',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webSecurity: true,
      // Allow internet access
      allowRunningInsecureContent: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'), // Optional: add app icon
    titleBarStyle: 'default',
    show: false, // Don't show until ready
  });

  // Wait for window to be ready before showing to prevent flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173')
      .catch(err => {
        console.error('Failed to load dev server:', err);
        console.log('Make sure Vite dev server is running on port 5173');
      });
    
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load from built files
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'))
      .catch(err => {
        console.error('Failed to load production build:', err);
      });
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links - open in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in the default browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      require('electron').shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
}

// This method will be called when Electron has finished initialization
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

// Handle any uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Security: Disable navigation to external websites for security
app.on('web-contents-created', (event, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    // Allow localhost and the app's own domain in dev mode
    if (isDev && parsedUrl.origin === 'http://localhost:5173') {
      return;
    }
    
    // Allow file:// protocol for production
    if (parsedUrl.protocol === 'file:') {
      return;
    }
    
    // For external navigation, we're allowing it for this trading app
    // as it needs to access external resources and APIs
    console.log('Navigation to:', navigationUrl);
  });
});
