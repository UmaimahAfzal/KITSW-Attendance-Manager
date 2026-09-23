const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kitswPrint', {
  printToPDF: () => ipcRenderer.invoke('print-to-pdf')
});