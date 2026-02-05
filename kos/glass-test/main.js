const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let liquidGlass;
try {
  liquidGlass = require("electron-liquid-glass");
  if (liquidGlass.default) liquidGlass = liquidGlass.default;
  console.log("[glass-test] supported:", liquidGlass.isGlassSupported());
  console.log("[glass-test] variants:", liquidGlass.GlassMaterialVariant);
} catch (err) {
  console.error("[glass-test] failed to load:", err);
}

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile(path.join(__dirname, "index.html"));

  win.webContents.once("did-finish-load", () => {
    if (liquidGlass) {
      win.setWindowButtonVisibility(true);
      const id = liquidGlass.addView(win.getNativeWindowHandle());
      console.log("[glass-test] addView returned:", id);

      // Send variant info to renderer
      win.webContents.send("glass-info", {
        viewId: id,
        variants: liquidGlass.GlassMaterialVariant,
      });
    }
  });

  // Handle variant changes from renderer
  ipcMain.on("set-variant", (_, variant) => {
    if (!liquidGlass) return;
    liquidGlass.unstable_setVariant(0, variant);
    console.log("[glass-test] variant set to:", variant);
  });

  ipcMain.on("set-scrim", (_, value) => {
    if (!liquidGlass) return;
    liquidGlass.unstable_setScrim(0, value);
    console.log("[glass-test] scrim set to:", value);
  });

  ipcMain.on("set-subdued", (_, value) => {
    if (!liquidGlass) return;
    liquidGlass.unstable_setSubdued(0, value);
    console.log("[glass-test] subdued set to:", value);
  });
});

app.on("window-all-closed", () => app.quit());
