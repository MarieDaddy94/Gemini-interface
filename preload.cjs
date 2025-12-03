const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Platform information
  platform: process.platform,
  
  // App version (if needed in the future)
  getVersion: () => {
    return process.versions.electron;
  },

  // Future IPC methods can be added here
  // For now, we're keeping it minimal as the app doesn't need special IPC yet
});

// Expose information about whether we're running in Electron
contextBridge.exposeInMainWorld('isElectron', true);

console.log('Preload script loaded successfully');
