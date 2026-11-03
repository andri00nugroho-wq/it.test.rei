import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

export function getUploadDirectory() {
  const dataDirectory = process.env.DATA_DIR
    ? resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR)
    : join(process.cwd(), "data");
  const directory = join(/*turbopackIgnore: true*/ dataDirectory, "uploads");
  mkdirSync(/*turbopackIgnore: true*/ directory, { recursive: true });
  return directory;
}

export function cleanOriginalName(value: string) {
  return value
    .replaceAll("\\", "/")
    .split("/")
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180) || "lampiran";
}
