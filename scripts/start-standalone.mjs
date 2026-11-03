import { spawn } from "node:child_process";
import { cp, mkdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import nextEnv from "@next/env";

const projectDirectory = process.cwd();
const standaloneDirectory = resolve(projectDirectory, ".next", "standalone");
const { loadEnvConfig } = nextEnv;

loadEnvConfig(projectDirectory);

await mkdir(join(standaloneDirectory, ".next"), { recursive: true });
await cp(
  resolve(projectDirectory, ".next", "static"),
  join(standaloneDirectory, ".next", "static"),
  { recursive: true, force: true },
);
await cp(resolve(projectDirectory, "public"), join(standaloneDirectory, "public"), {
  recursive: true,
  force: true,
});

const configuredDataDirectory = process.env.DATA_DIR;
process.env.DATA_DIR = configuredDataDirectory
  ? isAbsolute(configuredDataDirectory)
    ? configuredDataDirectory
    : resolve(projectDirectory, configuredDataDirectory)
  : resolve(projectDirectory, "data");

const server = spawn(process.execPath, ["server.js"], {
  cwd: standaloneDirectory,
  env: process.env,
  stdio: "inherit",
});

server.on("error", (error) => {
  console.error("Failed to start the standalone server:", error);
  process.exitCode = 1;
});

server.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
