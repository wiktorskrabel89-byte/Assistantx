'use strict';

function registerIpcHandlers(ipcMain, handlers) {
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

module.exports = {
  registerIpcHandlers,
};
