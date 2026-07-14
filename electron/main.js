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
const FROZEN_EXE_NAME = process.platform === "win32" ? "accrued-backend.exe" : "accrued-backend";

// Packaged layout puts the frozen backend and the frontend as siblings of
// this app's own files, both under resourcesPath — see electron-builder's
// extraResources config in package.json. Dev mode looks for a local
// `backend/dist/accrued-backend/` produced by `python build_backend.py`.
const FROZEN_BACKEND_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "backend-dist", "accrued-backend")
  : path.join(BACKEND_DIR, "dist", "accrued-backend");
// Always computed and always passed to the backend (not just when packaged):
// a locally frozen build run via plain `npm start` has no "../frontend" or
// "./data" sibling of its own — its bundled location is wherever PyInstaller
// put it — so it needs to be told explicitly even in dev mode. Kept at the
// same place regardless of source vs. frozen backend, so switching between
// them (e.g. across an app update) never orphans a user's existing data.
const BACKEND_FRONTEND_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "frontend")
  : path.join(BACKEND_DIR, "..", "frontend");
const BACKEND_DATA_DIR = app.isPackaged
  ? path.join(process.resourcesPath, "backend", "data")
  : path.join(BACKEND_DIR, "data");

let backendProcess = null;
let mainWindow = null;
let backendOutputLog = "";
let backendStartupError = null;

function logBackendOutput(chunk) {
  backendOutputLog = (backendOutputLog + chunk).slice(-4000); // keep the tail, that's what matters
}

/** Prefer a frozen, standalone backend (built with `python build_backend.py`,
 * bundled via extraResources) — that needs no Python installed on this
 * machine at all, which is the whole point of a real installer. Only fall
 * back to a system/venv Python when no frozen build is present (plain
 * `npm start` from source during development).
 *
 * Windows Python installs are inconsistent about what ends up on PATH: the
 * python.org installer only adds "python" if the user ticked that box, but
 * almost always registers the "py" launcher — tried as a fallback too. */
function resolveBackendCommand() {
  const frozenExe = path.join(FROZEN_BACKEND_DIR, FROZEN_EXE_NAME);
  if (fs.existsSync(frozenExe)) {
    return { cmd: frozenExe, args: ["--host", HOST, "--port", String(PORT)], cwd: FROZEN_BACKEND_DIR, isFrozen: true };
  }

  if (process.platform === "win32") {
    const venvPython = path.join(BACKEND_DIR, "venv", "Scripts", "python.exe");
    const base = fs.existsSync(venvPython) ? { cmd: venvPython, args: [] } : { cmd: "python", args: [] };
    return {
      ...base,
      args: [...base.args, "-m", "uvicorn", "main:app", "--host", HOST, "--port", String(PORT)],
      cwd: BACKEND_DIR,
      fallbacks: fs.existsSync(venvPython) ? [] : [
        { cmd: "py", args: ["-3", "-m", "uvicorn", "main:app", "--host", HOST, "--port", String(PORT)], cwd: BACKEND_DIR },
        { cmd: "python3", args: ["-m", "uvicorn", "main:app", "--host", HOST, "--port", String(PORT)], cwd: BACKEND_DIR },
      ],
    };
  }
  const venvPython = path.join(BACKEND_DIR, "venv", "bin", "python");
  const base = fs.existsSync(venvPython) ? { cmd: venvPython, args: [] } : { cmd: "python3", args: [] };
  return {
    ...base,
    args: [...base.args, "-m", "uvicorn", "main:app", "--host", HOST, "--port", String(PORT)],
    cwd: BACKEND_DIR,
    fallbacks: fs.existsSync(venvPython) ? [] : [
      { cmd: "python", args: ["-m", "uvicorn", "main:app", "--host", HOST, "--port", String(PORT)], cwd: BACKEND_DIR },
    ],
  };
}

function backendEnv() {
  return {
    ...process.env,
    ACCRUED_FRONTEND_DIR: BACKEND_FRONTEND_DIR,
    ACCRUED_DATA_DIR: BACKEND_DATA_DIR,
  };
}

function spawnBackend({ cmd, args, cwd }) {
  return spawn(cmd, args, { cwd, env: backendEnv() });
}

/** Look at what the backend actually printed before it died and give a
 * specific, correct hint instead of always assuming missing dependencies —
 * "port already in use" and "no module named X" need completely different
 * fixes, and showing the wrong one just sends people down the wrong path. */
function diagnoseBackendFailure(output) {
  if (/address already in use|Errno 98|Errno 10048|WinError 10048/i.test(output)) {
    return (
      `Port ${PORT} is already being used by another program on this machine ` +
      "(another local server, or a previous copy of this app that didn't fully close). " +
      `Close whatever else is using port ${PORT} and restart Accrued, or change the port ` +
      "this app uses in electron/main.js (PORT) and backend/main.py if that keeps happening."
    );
  }
  if (/ModuleNotFoundError|No module named/i.test(output)) {
    return (
      "Missing Python dependency. From the backend/ folder run:\n" +
      "  pip install -r requirements.txt\n" +
      "then restart Accrued."
    );
  }
  if (/PermissionError|Errno 13|EACCES/i.test(output)) {
    return `Permission denied — something is blocking access to a file port ${PORT} needs, or the backend/data folder isn't writable.`;
  }
  return (
    "Most likely cause: Python dependencies aren't installed. From the backend/ folder run:\n" +
    "  pip install -r requirements.txt"
  );
}

function startBackend() {
  const primary = resolveBackendCommand();
  const attempts = [{ cmd: primary.cmd, args: primary.args, cwd: primary.cwd }, ...(primary.fallbacks || [])];

  function tryNext(index) {
    if (index >= attempts.length) {
      backendStartupError = primary.isFrozen
        ? "Could not launch the bundled backend executable. It may be blocked by antivirus/security " +
          "software, or corrupted — try reinstalling Accrued."
        : "Could not find a Python interpreter to run the backend.\n\n" +
          "This build does not include a bundled backend — install Python 3.10+ from python.org " +
          '(tick "Add python.exe to PATH" during setup), then from the backend/ folder run:\n' +
          "  pip install -r requirements.txt\n" +
          "and restart Accrued.";
      return;
    }
    const attempt = attempts[index];
    const proc = spawnBackend(attempt);
    let settled = false;

    proc.on("error", () => {
      // ENOENT etc. — this command doesn't exist on this machine, try the next one.
      if (settled) return;
      settled = true;
      tryNext(index + 1);
    });
    proc.stdout.on("data", (data) => {
      process.stdout.write(`[backend] ${data}`);
      logBackendOutput(data.toString());
    });
    proc.stderr.on("data", (data) => {
      process.stderr.write(`[backend] ${data}`);
      logBackendOutput(data.toString());
    });
    proc.on("exit", (code) => {
      console.log(`Backend process (${attempt.cmd}) exited with code ${code}`);
      if (!settled && code !== 0) {
        // The interpreter launched but the backend crashed — this is a real
        // error, not "command not found", so don't fall through silently.
        settled = true;
        backendStartupError =
          `The backend process exited immediately (code ${code}) using "${attempt.cmd}".\n\n` +
          diagnoseBackendFailure(backendOutputLog) +
          (backendOutputLog ? `\n\nLast output from the backend:\n${backendOutputLog}` : "");
      }
      if (backendProcess === proc) backendProcess = null;
    });

    backendProcess = proc;
  }

  tryNext(0);
}

function waitForBackend(timeoutMs = 30000, intervalMs = 300) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    function ping() {
      if (backendStartupError) {
        reject(new Error(backendStartupError));
        return;
      }
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
      if (backendStartupError) {
        reject(new Error(backendStartupError));
        return;
      }
      if (Date.now() > deadline) {
        const detail = backendOutputLog ? `\n\nLast output from the backend:\n${backendOutputLog}` : "";
        reject(new Error("Backend did not become healthy in time." + detail));
        return;
      }
      setTimeout(ping, intervalMs);
    }
    ping();
  });
}

const LOGO_FULL_PATH = path.join(__dirname, "build", "logo-full.png");

function logoMarkup() {
  if (fs.existsSync(LOGO_FULL_PATH)) {
    const b64 = fs.readFileSync(LOGO_FULL_PATH).toString("base64");
    // The artwork is transparent-background with a navy wordmark, which reads
    // poorly directly on a dark screen — a soft glow behind it (not a hard
    // card) keeps enough contrast for the text without boxing the logo in.
    return `<div class="logo-glow"></div><img class="logo-img" src="data:image/png;base64,${b64}" alt="Accrued" />`;
  }
  // Text fallback so the animated startup screen still works before the real
  // logo asset is dropped into electron/build/logo-full.png.
  return `<div class="logo-text"><span class="logo-a">ACCRUED</span><span class="logo-b">ACCOUNTING SOFTWARE</span></div>`;
}

function loadingHtml() {
  return (
    "data:text/html;charset=utf-8," +
    encodeURIComponent(`<!doctype html>
      <html><head><meta charset="utf-8"><title>Accrued</title>
      <style>
        body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
          background:radial-gradient(circle at 50% 40%, #123047 0%, #0f1a2e 70%);
          color:#e7ebf1;font-family:-apple-system,Segoe UI,Roboto,sans-serif;overflow:hidden;}
        .box{text-align:center;}
        .logo-wrap{position:relative;display:inline-block;animation:reveal 1.1s cubic-bezier(.2,.8,.2,1) both;}
        .logo-glow{position:absolute;inset:-6px -10px;z-index:0;
          background:radial-gradient(ellipse at center, rgba(255,255,255,0.65) 0%, rgba(255,255,255,0.32) 50%, rgba(255,255,255,0) 75%);
          filter:blur(22px);}
        .logo-img{position:relative;z-index:1;display:block;max-width:360px;max-height:120px;width:auto;height:auto;}
        .logo-text{display:flex;flex-direction:column;align-items:center;gap:6px;}
        .logo-a{font-size:2.4rem;font-weight:800;letter-spacing:0.04em;
          background:linear-gradient(90deg,#2fb787,#5ec9d6);-webkit-background-clip:text;
          background-clip:text;color:transparent;}
        .logo-b{font-size:0.85rem;letter-spacing:0.28em;color:#7fd9c4;font-weight:600;}
        @keyframes reveal{
          0%{opacity:0;transform:translateY(14px) scale(0.92);}
          60%{opacity:1;}
          100%{opacity:1;transform:translateY(0) scale(1);}
        }
        .tagline{margin-top:14px;font-size:0.8rem;color:#8a97ab;letter-spacing:0.04em;
          animation:fadein 0.8s ease 0.5s both;}
        @keyframes fadein{from{opacity:0;}to{opacity:1;}}
        .spinner{width:26px;height:26px;border:3px solid rgba(255,255,255,0.15);
          border-top-color:#2fb787;border-radius:50%;margin:22px auto 0;animation:spin 0.8s linear infinite;}
        @keyframes spin{to{transform:rotate(360deg);}}
      </style></head>
      <body>
        <div class="box">
          <div class="logo-wrap">${logoMarkup()}</div>
          <div class="tagline">Starting up…</div>
          <div class="spinner"></div>
        </div>
      </body></html>`)
  );
}

const ICON_PATH = path.join(__dirname, "build", "icon.png");

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f1a2e",
    ...(fs.existsSync(ICON_PATH) ? { icon: ICON_PATH } : {}),
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
          `<pre style="color:#d9534f;font-family:monospace;padding:20px;white-space:pre-wrap;">Failed to start backend:\n${err.message}</pre>`
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
