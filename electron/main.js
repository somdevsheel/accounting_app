const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const http = require("http");

const BACKEND_DIR = path.join(__dirname, "..", "backend");
const HOST = "127.0.0.1";
const PORT = 8000;
const HEALTH_URL = `http://${HOST}:${PORT}/api/health`;
const APP_URL = `http://${HOST}:${PORT}/`;

let backendProcess = null;
let mainWindow = null;

function resolvePythonExecutable() {
  const candidates =
    process.platform === "win32"
      ? [path.join(BACKEND_DIR, "venv", "Scripts", "python.exe")]
      : [path.join(BACKEND_DIR, "venv", "bin", "python")];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  // Fall back to whatever Python is on PATH if no local venv was found.
  return process.platform === "win32" ? "python" : "python3";
}

function startBackend() {
  const pythonExe = resolvePythonExecutable();
  backendProcess = spawn(
    pythonExe,
    ["-m", "uvicorn", "main:app", "--host", HOST, "--port", String(PORT)],
    { cwd: BACKEND_DIR }
  );

  backendProcess.stdout.on("data", (data) => process.stdout.write(`[backend] ${data}`));
  backendProcess.stderr.on("data", (data) => process.stderr.write(`[backend] ${data}`));
  backendProcess.on("exit", (code) => {
    console.log(`Backend process exited with code ${code}`);
    backendProcess = null;
  });
}

function waitForBackend(timeoutMs = 30000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function ping() {
      const req = http.get(HEALTH_URL, (res) => {
        if (res.statusCode === 200) {
          res.resume();
          resolve();
        } else {
          res.resume();
          retry();
        }
      });
      req.on("error", retry);
    }
    function retry() {
      if (Date.now() > deadline) {
        reject(new Error("Backend did not become healthy in time"));
        return;
      }
      setTimeout(ping, intervalMs);
    }
    ping();
  });
}

function loadingHtml() {
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(`<!doctype html>
      <html><head><meta charset="utf-8"><title>Ledger</title>
      <style>
        body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
          background:#0f1a2e;color:#e7ebf1;font-family:-apple-system,Segoe UI,Roboto,sans-serif;}
        .box{text-align:center;}
        .spinner{width:34px;height:34px;border:3px solid rgba(255,255,255,0.2);
          border-top-color:#2fb787;border-radius:50%;margin:0 auto 16px;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
      </style></head>
      <body><div class="box"><div class="spinner"></div><div>Starting Ledger…</div></div></body></html>`)
  );
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f1a2e",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(loadingHtml());

  try {
    await waitForBackend();
    await mainWindow.loadURL(APP_URL);
  } catch (err) {
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          `<pre style="color:#d9534f;font-family:monospace;padding:20px;">Failed to start backend:\n${err.message}</pre>`
        )
    );
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function killBackend() {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
}

app.whenReady().then(() => {
  startBackend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  killBackend();
  app.quit();
});

app.on("before-quit", killBackend);
app.on("will-quit", killBackend);
