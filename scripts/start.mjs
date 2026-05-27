import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const require = createRequire(import.meta.url);
const electronPath = require("electron");
const isWindows = process.platform === "win32";
const npx = isWindows ? "npx.cmd" : "npx";

function runSync(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", shell: isWindows });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`))));
  });
}

await runSync(npx, ["vite", "build"]);

const { ELECTRON_RUN_AS_NODE: _removed, ...cleanEnv } = process.env;
const desktop = spawn(electronPath, [rootDir], {
  stdio: "inherit",
  env: cleanEnv
});

desktop.on("exit", (code) => process.exit(code ?? 0));
