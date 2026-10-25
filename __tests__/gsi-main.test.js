/**
 * Jest tests for the main-process side of CS2 Game State Integration:
 * finding CS2, writing the cfg and the local endpoint
 */

import fs from "fs";
import http from "http";
import os from "os";
import path from "path";

import { parseVdf, findCs2Dir } from "../src/main/cs2-locator.js";
import { buildGsiConfig, installGsiConfig } from "../src/main/gsi-config.js";
import { startGsiServer } from "../src/main/gsi-server.js";
import GsiService from "../src/main/gsi-service.js";
import { GSI_CONFIG, GSI_SETUP } from "../src/shared/constants.js";

const INSTALL_DIR = "Counter-Strike Global Offensive";
const vdfPath = (p) => p.replace(/\\/g, "\\\\");

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "casual-enjoyer-gsi-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

/**
 * Create a fake CS2 install, optionally with its cfg folder
 * @param {string} library - Steam library folder
 * @param {{withCfg?: boolean}} [options]
 * @returns {string} - CS2 folder
 */
function makeCs2(library, { withCfg = true } = {}) {
  const cs2Dir = path.join(library, "steamapps", "common", INSTALL_DIR);
  fs.mkdirSync(path.join(cs2Dir, "game", "csgo", withCfg ? "cfg" : ""), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(library, "steamapps", "appmanifest_730.acf"),
    `"AppState"\n{\n\t"appid"\t\t"730"\n\t"installdir"\t\t"${INSTALL_DIR}"\n}\n`
  );
  return cs2Dir;
}

/**
 * POST a body to the local endpoint
 * @returns {Promise<number>} - HTTP status
 */
function post(port, body, method = "POST") {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path: "/" },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      }
    );
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

describe("parseVdf", () => {
  test("parses nested blocks, escapes and comments", () => {
    const parsed = parseVdf(`
      // written by Steam
      "libraryfolders"
      {
        "0"
        {
          "path"   "C:\\\\Program Files (x86)\\\\Steam"
          "apps" { "228980" "1" }
        }
        "1" { "path" "E:\\\\Steam \\"Lib\\"" "apps" { "730" "760" } }
      }
    `);

    expect(parsed.libraryfolders["0"].path).toBe(
      "C:\\Program Files (x86)\\Steam"
    );
    expect(parsed.libraryfolders["1"].path).toBe('E:\\Steam "Lib"');
    expect(parsed.libraryfolders["1"].apps).toEqual({ 730: "760" });
  });

  test("tolerates broken input", () => {
    expect(parseVdf('"a" { "b" "c"')).toEqual({ a: { b: "c" } });
    expect(parseVdf("")).toEqual({});
    expect(parseVdf(undefined)).toEqual({});
  });
});

describe("findCs2Dir", () => {
  test("finds CS2 in the library that lists app 730", async () => {
    const steam = path.join(tmpRoot, "Steam");
    const library = path.join(tmpRoot, "Library");
    fs.mkdirSync(path.join(steam, "steamapps"), { recursive: true });
    const cs2Dir = makeCs2(library);
    fs.writeFileSync(
      path.join(steam, "steamapps", "libraryfolders.vdf"),
      `"libraryfolders"
{
  "0" { "path" "${vdfPath(steam)}" "apps" { "228980" "1" } }
  "1" { "path" "${vdfPath(library)}" "apps" { "730" "760" } }
}`
    );

    await expect(findCs2Dir(steam)).resolves.toBe(cs2Dir);
  });

  test("finds CS2 in the Steam folder itself without libraryfolders.vdf", async () => {
    const steam = path.join(tmpRoot, "Steam");
    const cs2Dir = makeCs2(steam);

    await expect(findCs2Dir(steam)).resolves.toBe(cs2Dir);
  });

  test("returns null when no library holds CS2", async () => {
    const steam = path.join(tmpRoot, "Steam");
    fs.mkdirSync(path.join(steam, "steamapps"), { recursive: true });

    await expect(findCs2Dir(steam)).resolves.toBeNull();
    await expect(findCs2Dir(null)).resolves.toBeNull();
  });

  test("ignores a manifest whose game folder is gone", async () => {
    const steam = path.join(tmpRoot, "Steam");
    const cs2Dir = makeCs2(steam);
    fs.rmSync(cs2Dir, { recursive: true, force: true });

    await expect(findCs2Dir(steam)).resolves.toBeNull();
  });
});

describe("GSI cfg", () => {
  test("points CS2 at the endpoint with the token", () => {
    const cfg = parseVdf(buildGsiConfig({ port: 47731, token: "abc123" }));
    const service = cfg[GSI_CONFIG.SERVICE_NAME];

    expect(service.uri).toBe("http://127.0.0.1:47731");
    expect(service.auth).toEqual({ token: "abc123" });
    expect(service.heartbeat).toBe("5.0");
    expect(service.data).toMatchObject({ provider: "1", map: "1", player_id: "1" });
  });

  test("writes the cfg once and rewrites it only when it changes", async () => {
    const cs2Dir = makeCs2(tmpRoot);
    const options = { port: 47731, token: "abc123" };

    const first = await installGsiConfig(cs2Dir, options);
    expect(first.changed).toBe(true);
    expect(first.cfgPath).toBe(
      path.join(cs2Dir, "game", "csgo", "cfg", GSI_CONFIG.CFG_FILE_NAME)
    );
    expect(fs.readFileSync(first.cfgPath, "utf-8")).toBe(buildGsiConfig(options));

    await expect(installGsiConfig(cs2Dir, options)).resolves.toMatchObject({
      changed: false,
    });
    await expect(
      installGsiConfig(cs2Dir, { ...options, port: 47732 })
    ).resolves.toMatchObject({ changed: true });
  });

  test("never creates the cfg folder", async () => {
    const cs2Dir = makeCs2(tmpRoot, { withCfg: false });

    await expect(
      installGsiConfig(cs2Dir, { port: 47731, token: "abc123" })
    ).rejects.toThrow();
    expect(fs.existsSync(path.join(cs2Dir, "game", "csgo", "cfg"))).toBe(false);
  });
});

describe("startGsiServer", () => {
  let server;

  afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    server = null;
  });

  test("passes on a state carrying the token, without the token", async () => {
    const onState = jest.fn();
    ({ server } = await startGsiServer({ port: 0, token: "secret", onState }));
    const { port } = server.address();

    const status = await post(
      port,
      JSON.stringify({ auth: { token: "secret" }, provider: { steamid: "1" } })
    );

    expect(status).toBe(200);
    expect(onState).toHaveBeenCalledWith({ provider: { steamid: "1" } });
  });

  test.each([
    ["a wrong token", JSON.stringify({ auth: { token: "nope" } }), 401],
    ["no token", JSON.stringify({ provider: {} }), 401],
    ["invalid JSON", "{not json", 400],
  ])("rejects %s", async (_name, body, expected) => {
    const onState = jest.fn();
    ({ server } = await startGsiServer({ port: 0, token: "secret", onState }));

    await expect(post(server.address().port, body)).resolves.toBe(expected);
    expect(onState).not.toHaveBeenCalled();
  });

  test("rejects other methods", async () => {
    const onState = jest.fn();
    ({ server } = await startGsiServer({ port: 0, token: "secret", onState }));

    await expect(post(server.address().port, undefined, "GET")).resolves.toBe(
      405
    );
  });

  test("rejects a body over the limit", async () => {
    const onState = jest.fn();
    ({ server } = await startGsiServer({
      port: 0,
      token: "secret",
      onState,
      maxBodyBytes: 64,
    }));

    const body = JSON.stringify({ auth: { token: "secret" }, pad: "x".repeat(200) });
    await expect(post(server.address().port, body)).resolves.toBe(413);
    expect(onState).not.toHaveBeenCalled();
  });

  test("moves to the next port when the preferred one is taken", async () => {
    const blocker = http.createServer();
    await new Promise((resolve) => blocker.listen(0, "127.0.0.1", resolve));
    const taken = blocker.address().port;

    try {
      let port;
      ({ server, port } = await startGsiServer({
        port: taken,
        token: "secret",
        onState: jest.fn(),
      }));
      expect(port).toBeGreaterThan(taken);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});

describe("GsiService", () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  let services;

  beforeEach(() => {
    services = [];
  });

  afterEach(async () => {
    await Promise.all(services.map((service) => service.stop()));
  });

  const createService = (locate) => {
    const service = new GsiService({
      storePath: path.join(tmpRoot, "gsi.json"),
      logger,
      locate,
      defaultPort: 0,
    });
    services.push(service);
    return service;
  };

  test("starts the endpoint, writes the cfg and forwards states", async () => {
    const cs2Dir = makeCs2(path.join(tmpRoot, "Library"));
    const onState = jest.fn();
    const service = createService(async () => cs2Dir);

    const status = await service.start(onState);

    expect(status).toMatchObject({ setup: GSI_SETUP.READY, changed: true });
    await expect(service.getStatus()).resolves.toBe(status);

    const store = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, "gsi.json"), "utf-8")
    );
    expect(store.port).toBe(status.port);
    expect(store.token).toMatch(/^[0-9a-f]{32}$/);
    expect(fs.readFileSync(status.cfgPath, "utf-8")).toBe(
      buildGsiConfig({ port: status.port, token: store.token })
    );

    await post(
      status.port,
      JSON.stringify({ auth: { token: store.token }, map: { name: "de_dust2" } })
    );
    expect(onState).toHaveBeenCalledWith({ map: { name: "de_dust2" } });
  });

  test("keeps the token and port across restarts, so the cfg stays valid", async () => {
    const cs2Dir = makeCs2(path.join(tmpRoot, "Library"));
    const first = createService(async () => cs2Dir);
    const firstStatus = await first.start(jest.fn());
    await first.stop();

    const second = createService(async () => cs2Dir);
    const secondStatus = await second.start(jest.fn());

    expect(secondStatus.port).toBe(firstStatus.port);
    expect(secondStatus.changed).toBe(false);
  });

  test("reports a missing CS2 installation", async () => {
    const service = createService(async () => null);

    await expect(service.start(jest.fn())).resolves.toMatchObject({
      setup: GSI_SETUP.CS2_NOT_FOUND,
    });
  });

  test("reports an error instead of throwing", async () => {
    const service = createService(async () => {
      throw new Error("registry unavailable");
    });

    await expect(service.start(jest.fn())).resolves.toEqual({
      setup: GSI_SETUP.ERROR,
    });
  });

  test("getStatus before start reports an error", async () => {
    const service = createService(async () => null);

    await expect(service.getStatus()).resolves.toEqual({
      setup: GSI_SETUP.ERROR,
    });
  });
});
