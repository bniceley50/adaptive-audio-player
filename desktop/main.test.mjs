import { EventEmitter } from "node:events";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configureHostDataEnvironment,
  createBrowserWindowOptions,
  launchDesktopShell,
  parseStagedAppOrigin,
  rendererContentSecurityPolicy,
  rendererSessionPartition,
} from "./main.mjs";
import {
  createPackagerOptions,
  electronVersion,
  electronZipName,
  electronZipSha256,
  prepareElectronShellSource,
  prepareRuntimeResources,
} from "./packager.mjs";

const temporaryRoots = [];

afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of temporaryRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("desktop shell security", () => {
  it("accepts only an explicit unprivileged 127.0.0.1 HTTP origin", () => {
    expect(parseStagedAppOrigin("http://127.0.0.1:3199")).toBe(
      "http://127.0.0.1:3199",
    );
    for (const value of [
      "https://127.0.0.1:3199",
      "http://localhost:3199",
      "http://127.0.0.1:80",
      "http://127.0.0.1:3199/path",
      "http://example.com:3199",
    ]) {
      expect(() => parseStagedAppOrigin(value)).toThrow();
    }
  });

  it("creates a sandboxed renderer with no Node or preload bridge", () => {
    expect(createBrowserWindowOptions().webPreferences).toEqual({
      allowRunningInsecureContent: false,
      contextIsolation: true,
      devTools: false,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      webSecurity: true,
    });
    expect(createBrowserWindowOptions().webPreferences).not.toHaveProperty(
      "preload",
    );
  });

  it("overwrites inherited Node and Python paths with shared app data", () => {
    const userData = path.join(tmpdir(), "Brían app data");
    const app = {
      getPath: vi.fn().mockReturnValue(userData),
    };
    const environment = {
      ADAPTIVE_AUDIO_PLAYER_DATA_ROOT: path.join(process.cwd(), "package-data"),
      ADAPTIVE_AUDIO_PLAYER_DB_PATH: path.join(process.cwd(), "package.sqlite"),
      ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT: path.join(
        process.cwd(),
        "python-data",
      ),
      ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT: path.join(
        process.cwd(),
        "renders",
      ),
      PATH: process.env.PATH,
    };

    const result = configureHostDataEnvironment(app, environment);

    expect(app.getPath).toHaveBeenCalledWith("userData");
    expect(result).toEqual({
      dataRoot: userData,
      databasePath: path.join(
        userData,
        "database",
        "adaptive-audio-player.sqlite",
      ),
      renderRoot: path.join(userData, "tts-renders"),
    });
    expect(environment).toMatchObject({
      ADAPTIVE_AUDIO_PLAYER_DATA_ROOT: result.dataRoot,
      ADAPTIVE_AUDIO_PLAYER_DB_PATH: result.databasePath,
      ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT: result.dataRoot,
      ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT: result.renderRoot,
      PATH: process.env.PATH,
    });
    expect(result.dataRoot.startsWith(process.cwd())).toBe(false);
  });

  it("rejects a non-absolute Electron data path", () => {
    expect(() =>
      configureHostDataEnvironment(
        { getPath: () => "relative-user-data" },
        {},
      ),
    ).toThrow("Electron userData must resolve to an absolute path.");
  });

  it("denies external requests, navigation, windows, webviews, and permissions", async () => {
    const app = new EventEmitter();
    app.whenReady = vi.fn().mockResolvedValue(undefined);
    app.getPath = vi
      .fn()
      .mockReturnValue(path.join(tmpdir(), "Adaptive Audio Player"));
    app.quit = vi.fn();
    const webContents = new EventEmitter();
    webContents.setWindowOpenHandler = vi.fn();
    const window = new EventEmitter();
    window.webContents = webContents;
    window.show = vi.fn();
    window.loadURL = vi.fn().mockResolvedValue(undefined);
    const BrowserWindow = vi.fn(function BrowserWindow(options) {
      this.options = options;
      return window;
    });
    const permissionHandlers = {};
    const requestHandlers = {};
    const rendererSession = {
      cookies: {
        set: vi.fn().mockResolvedValue(undefined),
      },
      setPermissionCheckHandler: vi.fn((handler) => {
        permissionHandlers.check = handler;
      }),
      setPermissionRequestHandler: vi.fn((handler) => {
        permissionHandlers.request = handler;
      }),
      webRequest: {
        onBeforeRequest: vi.fn((handler) => {
          requestHandlers.before = handler;
        }),
        onHeadersReceived: vi.fn((handler) => {
          requestHandlers.headers = handler;
        }),
      },
    };
    const fromPartition = vi.fn().mockReturnValue(rendererSession);

    const environment = {};
    const resourcesPath = path.join(tmpdir(), "packaged-resources");
    const runtimeStop = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      appOrigin: "http://127.0.0.1:3199",
      localSession: {
        cookieName: "adaptive_audio_player_local_session",
        secret: "a".repeat(64),
      },
      stop: runtimeStop,
    };
    const startRuntime = vi.fn().mockResolvedValue(runtime);
    const result = await launchDesktopShell(
      { app, BrowserWindow, session: { fromPartition } },
      environment,
      { resourcesPath, startRuntime },
    );

    expect(result.allowedOrigin).toBe("http://127.0.0.1:3199");
    expect(result.runtime).toBe(runtime);
    expect(result.rendererSession).toBe(rendererSession);
    expect(result.hostData).toEqual({
      dataRoot: path.join(tmpdir(), "Adaptive Audio Player"),
      databasePath: path.join(
        tmpdir(),
        "Adaptive Audio Player",
        "database",
        "adaptive-audio-player.sqlite",
      ),
      renderRoot: path.join(
        tmpdir(),
        "Adaptive Audio Player",
        "tts-renders",
      ),
    });
    expect(environment.ADAPTIVE_AUDIO_PLAYER_DATA_ROOT).toBe(
      result.hostData.dataRoot,
    );
    expect(environment.ADAPTIVE_AUDIO_PLAYER_DB_PATH).toBe(
      result.hostData.databasePath,
    );
    expect(environment.ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT).toBe(
      result.hostData.dataRoot,
    );
    expect(environment.ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT).toBe(
      result.hostData.renderRoot,
    );
    expect(startRuntime).toHaveBeenCalledWith({
      resourcesPath,
      environment,
    });
    expect(fromPartition).toHaveBeenCalledWith(rendererSessionPartition, {
      cache: false,
    });
    expect(rendererSession.cookies.set).toHaveBeenCalledWith({
      url: "http://127.0.0.1:3199",
      name: "adaptive_audio_player_local_session",
      value: "a".repeat(64),
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: false,
    });
    expect(rendererSession.cookies.set.mock.calls[0][0]).not.toHaveProperty(
      "expirationDate",
    );
    expect(rendererSession.cookies.set.mock.invocationCallOrder[0]).toBeLessThan(
      window.loadURL.mock.invocationCallOrder[0],
    );
    expect(window.loadURL).toHaveBeenCalledWith("http://127.0.0.1:3199");
    expect(BrowserWindow.mock.calls[0][0].webPreferences.nodeIntegration).toBe(
      false,
    );
    expect(BrowserWindow.mock.calls[0][0].webPreferences.session).toBe(
      rendererSession,
    );
    expect(webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({
      action: "deny",
    });
    const externalNavigation = { preventDefault: vi.fn() };
    webContents.emit(
      "will-navigate",
      externalNavigation,
      "https://example.com/",
    );
    expect(externalNavigation.preventDefault).toHaveBeenCalledOnce();
    const localNavigation = { preventDefault: vi.fn() };
    webContents.emit(
      "will-navigate",
      localNavigation,
      "http://127.0.0.1:3199/player/book-1",
    );
    expect(localNavigation.preventDefault).not.toHaveBeenCalled();
    const webview = { preventDefault: vi.fn() };
    webContents.emit("will-attach-webview", webview);
    expect(webview.preventDefault).toHaveBeenCalledOnce();
    expect(permissionHandlers.check()).toBe(false);
    const permissionCallback = vi.fn();
    permissionHandlers.request(null, "media", permissionCallback);
    expect(permissionCallback).toHaveBeenCalledWith(false);
    const externalRequest = vi.fn();
    requestHandlers.before({ url: "https://example.com/file" }, externalRequest);
    expect(externalRequest).toHaveBeenCalledWith({ cancel: true });
    const localRequest = vi.fn();
    requestHandlers.before(
      { url: "http://127.0.0.1:3199/_next/static/app.js" },
      localRequest,
    );
    expect(localRequest).toHaveBeenCalledWith({ cancel: false });
    const responseHeadersCallback = vi.fn();
    requestHandlers.headers(
      {
        responseHeaders: {
          "content-security-policy": ["default-src *"],
          "X-Test": ["preserved"],
        },
      },
      responseHeadersCallback,
    );
    expect(responseHeadersCallback).toHaveBeenCalledWith({
      responseHeaders: {
        "Content-Security-Policy": [rendererContentSecurityPolicy],
        "Permissions-Policy": [
          "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
        ],
        "X-Test": ["preserved"],
      },
    });
    app.emit("window-all-closed");
    await vi.waitFor(() => {
      expect(runtimeStop).toHaveBeenCalledOnce();
      expect(app.quit).toHaveBeenCalledOnce();
    });
  });
});

describe("direct Electron Packager proof", () => {
  it("pins the approved Windows runtime and disables overwrite and pruning", () => {
    const options = createPackagerOptions({
      inputDirectory: "input",
      outputDirectory: "output",
      electronZipDirectory: "zips",
      runtimeDirectory: "runtime",
    });
    expect({
      electronVersion,
      electronZipName,
      electronZipSha256,
      platform: options.platform,
      arch: options.arch,
      asar: options.asar,
      overwrite: options.overwrite,
      prune: options.prune,
      extraResource: options.extraResource,
    }).toEqual({
      electronVersion: "43.1.1",
      electronZipName: "electron-v43.1.1-win32-x64.zip",
      electronZipSha256:
        "b4e9995cd3f65785eb8818276aa9020f3165ab11da41b3c762616d4a0ad8c7ad",
      platform: "win32",
      arch: "x64",
      asar: true,
      overwrite: false,
      prune: false,
      extraResource: [path.resolve("runtime")],
    });
  });

  it("generates a minimal three-file shell source", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adaptive-electron-shell-"));
    temporaryRoots.push(root);
    const inputDirectory = path.join(root, "input");

    const manifest = await prepareElectronShellSource({ inputDirectory });

    expect(manifest).toMatchObject({
      name: "adaptive-audio-player-desktop",
      main: "main.mjs",
      type: "module",
    });
    await expect(access(path.join(inputDirectory, "main.mjs"))).resolves.toBeUndefined();
    await expect(
      access(path.join(inputDirectory, "supervisor.mjs")),
    ).resolves.toBeUndefined();
    expect(
      JSON.parse(await readFile(path.join(inputDirectory, "package.json"), "utf8")),
    ).toEqual(manifest);
  });

  it("assembles the explicit packaged runtime layout without symlinks", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "adaptive-runtime-layout-"));
    temporaryRoots.push(root);
    const nodeSource = path.join(root, "node-source");
    const appSource = path.join(root, "app-source");
    const sidecarSource = path.join(root, "sidecar-source");
    const runtimeDirectory = path.join(root, "runtime");
    const modelRoot = path.join(
      sidecarSource,
      "_internal",
      "models",
      "kokoro",
      "f3ff3571791e39611d31c381e3a41a3af07b4987",
    );
    await Promise.all([
      mkdir(nodeSource, { recursive: true }),
      mkdir(path.join(appSource, "scripts"), { recursive: true }),
      mkdir(path.join(modelRoot, "voices"), { recursive: true }),
    ]);
    await Promise.all([
      writeFile(path.join(nodeSource, "node.exe"), "node"),
      writeFile(path.join(nodeSource, "LICENSE"), "license"),
      writeFile(path.join(appSource, "server.js"), "server"),
      writeFile(path.join(appSource, "scripts", "job-worker.mjs"), "worker"),
      writeFile(path.join(appSource, "stage-manifest.json"), "{}"),
      writeFile(
        path.join(sidecarSource, "AdaptiveAudioPlayerTTS.exe"),
        "sidecar",
      ),
      writeFile(path.join(modelRoot, "kokoro-v1_0.pth"), "model"),
      writeFile(path.join(modelRoot, "config.json"), "config"),
      ...["af_heart", "af_bella", "am_michael"].map((voice) =>
        writeFile(path.join(modelRoot, "voices", `${voice}.pt`), voice),
      ),
    ]);

    const layout = await prepareRuntimeResources({
      runtimeDirectory,
      nodeRuntimeDirectory: nodeSource,
      appStageDirectory: appSource,
      sidecarDirectory: sidecarSource,
    });

    expect(layout).toEqual({
      runtimeRoot: runtimeDirectory,
      nodeExecutable: path.join(runtimeDirectory, "node", "node.exe"),
      serverEntry: path.join(runtimeDirectory, "app", "server.js"),
      workerEntry: path.join(
        runtimeDirectory,
        "app",
        "scripts",
        "job-worker.mjs",
      ),
      sidecarExecutable: path.join(
        runtimeDirectory,
        "tts",
        "AdaptiveAudioPlayerTTS.exe",
      ),
    });
    await expect(access(layout.nodeExecutable)).resolves.toBeUndefined();
    await expect(access(layout.serverEntry)).resolves.toBeUndefined();
    await expect(access(layout.workerEntry)).resolves.toBeUndefined();
    await expect(access(layout.sidecarExecutable)).resolves.toBeUndefined();
  });
});
