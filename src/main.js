const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const BackupServer = require('./server');

let mainWindow;
let backupServer;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 400,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
    createWindow();
    backupServer = new BackupServer();

    ipcMain.on('start-server', () => {
        backupServer.start();
    });

    ipcMain.on('stop-server', () => {
        backupServer.stop();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
}); 