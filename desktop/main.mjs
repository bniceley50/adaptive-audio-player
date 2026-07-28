import path from "node:path";
import process from "node:process";

import { startPackagedRuntime } from "./supervisor.mjs";

const loopbackHostname = "127.0.0.1";
export const rendererSessionPartition =
  "persist:adaptive-audio-player-renderer";
export const rendererContentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'none'",
  "connect-src 'self'",
  "font-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'none'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'none'",
].join("; ");
const rendererPermissionsPolicy = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
].join(", ");

export function parseStagedAppOrigin(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("ADAPTIVE_AUDIO_PLAYER_APP_ORIGIN is required.");
  }

  let parsed;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("The staged application origin must be a valid URL.");
  }
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== loopbackHostname ||
    !parsed.port ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(
      "The staged application origin must be http://127.0.0.1:<port> with no credentials or path.",
    );
  }
  const port = Number(parsed.port);
  if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
    throw new Error("The staged application port must be between 1024 and 65535.");
  }
  return parsed.origin;
}

export function createBrowserWindowOptions(targetSession) {
  return {
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: "#111827",
    autoHideMenuBar: true,
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: false,
      nodeIntegration: false,
      sandbox: true,
      ...(targetSession ? { session: targetSession } : {}),
      spellcheck: false,
      webSecurity: true,
    },
  };
}

export function configureHostDataEnvironment(app, environment = process.env) {
  const rawDataRoot = app.getPath("userData");
  if (
    typeof rawDataRoot !== "string" ||
    !rawDataRoot.trim() ||
    !path.isAbsolute(rawDataRoot)
  ) {
    throw new Error("Electron userData must resolve to an absolute path.");
  }

  const dataRoot = path.normalize(rawDataRoot);
  const databasePath = path.join(
    dataRoot,
    "database",
    "adaptive-audio-player.sqlite",
  );
  const renderRoot = path.join(dataRoot, "tts-renders");
  environment.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT = dataRoot;
  environment.ADAPTIVE_AUDIO_PLAYER_DB_PATH = databasePath;
  environment.ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT = dataRoot;
  environment.ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT = renderRoot;
  return { dataRoot, databasePath, renderRoot };
}

function isAllowedRendererUrl(value, allowedOrigin) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" && parsed.origin === allowedOrigin;
  } catch {
    return false;
  }
}

export function secureWebContents(webContents, allowedOrigin) {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  for (const eventName of ["will-navigate", "will-redirect"]) {
    webContents.on(eventName, (event, targetUrl) => {
      if (!isAllowedRendererUrl(targetUrl, allowedOrigin)) {
        event.preventDefault();
      }
    });
  }
  webContents.on("will-attach-webview", (event) => {
    event.preventDefault();
  });
}

function secureSession(targetSession, allowedOrigin) {
  targetSession.setPermissionCheckHandler(() => false);
  targetSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    let allowed = false;
    try {
      const parsed = new URL(details.url);
      allowed =
        (parsed.protocol === "http:" && parsed.origin === allowedOrigin) ||
        parsed.protocol === "blob:" ||
        parsed.protocol === "data:";
    } catch {
      allowed = false;
    }
    callback({ cancel: !allowed });
  });
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = Object.fromEntries(
      Object.entries(details.responseHeaders ?? {}).filter(
        ([name]) =>
          ![
            "content-security-policy",
            "permissions-policy",
          ].includes(name.toLowerCase()),
      ),
    );
    responseHeaders["Content-Security-Policy"] = [
      rendererContentSecurityPolicy,
    ];
    responseHeaders["Permissions-Policy"] = [rendererPermissionsPolicy];
    callback({ responseHeaders });
  });
}

function readRuntimeLocalSession(runtime) {
  const cookieName = runtime.localSession?.cookieName;
  const secret = runtime.localSession?.secret;
  if (
    typeof cookieName !== "string" ||
    !/^[a-z][a-z0-9_]{0,63}$/.test(cookieName) ||
    typeof secret !== "string" ||
    !/^[a-f0-9]{64}$/i.test(secret)
  ) {
    throw new Error("The packaged runtime returned an invalid local session.");
  }
  return { cookieName, secret };
}

export async function launchDesktopShell(
  electron,
  environment = process.env,
  dependencies = {},
) {
  const { app, BrowserWindow, session } = electron;
  await app.whenReady();
  const hostData = configureHostDataEnvironment(app, environment);
  const startRuntime = dependencies.startRuntime ?? startPackagedRuntime;
  const runtime = await startRuntime({
    resourcesPath: dependencies.resourcesPath ?? process.resourcesPath,
    environment,
  });

  let shutdownPromise;
  let shutdownComplete = false;
  let quitRequested = false;
  const shutdown = () => {
    shutdownPromise ??= Promise.resolve(runtime.stop()).finally(() => {
      shutdownComplete = true;
    });
    return shutdownPromise;
  };
  const requestQuit = () => {
    if (shutdownComplete) {
      app.quit();
      return;
    }
    if (quitRequested) {
      return;
    }
    quitRequested = true;
    void shutdown().then(
      () => app.quit(),
      () => app.quit(),
    );
  };
  app.on("before-quit", (event) => {
    if (!shutdownComplete) {
      event.preventDefault();
      requestQuit();
    }
  });

  try {
    const allowedOrigin = parseStagedAppOrigin(runtime.appOrigin);
    const localSession = readRuntimeLocalSession(runtime);
    const rendererSession = session.fromPartition(rendererSessionPartition, {
      cache: false,
    });
    await rendererSession.cookies.set({
      url: allowedOrigin,
      name: localSession.cookieName,
      value: localSession.secret,
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: false,
    });
    secureSession(rendererSession, allowedOrigin);

    const securedContents = new WeakSet();
    const secureOnce = (webContents) => {
      if (!securedContents.has(webContents)) {
        securedContents.add(webContents);
        secureWebContents(webContents, allowedOrigin);
      }
    };
    app.on("web-contents-created", (_event, webContents) => {
      secureOnce(webContents);
    });

    const window = new BrowserWindow(
      createBrowserWindowOptions(rendererSession),
    );
    secureOnce(window.webContents);
    window.once("ready-to-show", () => window.show());
    app.on("window-all-closed", requestQuit);
    await window.loadURL(allowedOrigin);
    return {
      allowedOrigin,
      hostData,
      rendererSession,
      runtime,
      shutdown,
      window,
    };
  } catch (error) {
    await shutdown();
    throw error;
  }
}

if (process.versions.electron) {
  import("electron")
    .then((electron) => launchDesktopShell(electron))
    .catch((error) => {
      process.stderr.write(
        `[desktop] ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
