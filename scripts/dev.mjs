import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const electronPath = require("electron");

const children = [];
const isWindows = process.platform === "win32";
const npx = isWindows ? "npx.cmd" : "npx";

function run(command, args, options = {}) {
  const child = spawn(command, args, {
    stdio: "inherit",
    shell: isWindows,
    ...options
  });
  children.push(child);
  return child;
}

async function waitForVite() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const response = await fetch("http://127.0.0.1:5173");
      if (response.ok) return;
    } catch {
      await wait(500);
    }
  }
  throw new Error("Vite dev server did not become ready on port 5173.");
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(0);
});

process.on("SIGTERM", () => {
  shutdown();
  process.exit(0);
});

run(npx, ["vite", "--host", "127.0.0.1", "--port", "5173"]);
await waitForVite();

const { ELECTRON_RUN_AS_NODE: _removed, ...cleanEnv } = process.env;
const desktop = spawn(electronPath, [rootDir], {
  stdio: "inherit",
  env: {
    ...cleanEnv,
    VITE_DEV_SERVER_URL: "http://127.0.0.1:5173"
  }
});
children.push(desktop);

desktop.on("exit", (code) => {
  shutdown();
  process.exit(code ?? 0);
});
