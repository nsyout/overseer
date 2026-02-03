#!/usr/bin/env node
/**
 * Build the npm package by copying host/ and ui/dist/ to npm/overseer/
 */
import { cpSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..", "..");
const npmPkg = join(__dirname, "..", "overseer");

// Source directories
const hostDist = join(root, "host", "dist");
const uiDist = join(root, "ui", "dist");

// Destination directories
const hostDest = join(npmPkg, "host", "dist");
const uiDest = join(npmPkg, "ui", "dist");

// Check sources exist
if (!existsSync(hostDist)) {
  console.error("Error: host/dist not found. Run 'cd host && npm run build' first.");
  process.exit(1);
}

if (!existsSync(uiDist)) {
  console.error("Error: ui/dist not found. Run 'cd ui && npm run build' first.");
  process.exit(1);
}

// Clean old copies
console.log("Cleaning old npm package assets...");
if (existsSync(join(npmPkg, "host"))) {
  rmSync(join(npmPkg, "host"), { recursive: true });
}
if (existsSync(join(npmPkg, "ui"))) {
  rmSync(join(npmPkg, "ui"), { recursive: true });
}
if (existsSync(join(npmPkg, "dist"))) {
  rmSync(join(npmPkg, "dist"), { recursive: true });
}

// Copy host/dist
console.log("Copying host/dist -> npm/overseer/host/dist");
cpSync(hostDist, hostDest, { recursive: true });

// Copy ui/dist (static files only - assets and index.html)
console.log("Copying ui/dist -> npm/overseer/ui/dist");
cpSync(uiDist, uiDest, { recursive: true });

console.log("Done! npm package is ready at npm/overseer/");
