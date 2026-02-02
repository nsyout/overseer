#!/usr/bin/env node
/**
 * Build UI and copy to npm package
 * 
 * Steps:
 * 1. Run `npm run build` in ui/ (vite build)
 * 2. Run `npm run build:server` in ui/ (esbuild bundle)
 * 3. Copy ui/dist/* → npm/overseer/dist/ui/static/
 * 4. Copy ui/dist-server/server.js → npm/overseer/dist/ui/server.js
 */
import { execSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "../..");
const uiDir = join(rootDir, "ui");
const targetDir = join(__dirname, "../overseer/dist/ui");

console.log("Building Overseer UI...\n");

// Step 1: Build UI (vite)
console.log("1. Building static assets (vite)...");
execSync("npm run build", { cwd: uiDir, stdio: "inherit" });
console.log();

// Step 2: Build server (esbuild)
console.log("2. Bundling server (esbuild)...");
execSync("npm run build:server", { cwd: uiDir, stdio: "inherit" });
console.log();

// Step 3: Clean target directory
console.log("3. Preparing target directory...");
rmSync(targetDir, { recursive: true, force: true });
mkdirSync(targetDir, { recursive: true });
mkdirSync(join(targetDir, "static"), { recursive: true });

// Step 4: Copy vite output to static/ (only client assets, not tsc output)
console.log("4. Copying static assets...");
const viteOutput = join(uiDir, "dist");
if (!existsSync(viteOutput)) {
  console.error(`Vite output not found: ${viteOutput}`);
  process.exit(1);
}
// Copy index.html
cpSync(join(viteOutput, "index.html"), join(targetDir, "static", "index.html"));
// Copy assets/ directory (vite bundled JS/CSS)
const assetsDir = join(viteOutput, "assets");
if (existsSync(assetsDir)) {
  cpSync(assetsDir, join(targetDir, "static", "assets"), { recursive: true });
}

// Step 5: Copy bundled server
console.log("5. Copying server bundle...");
const serverBundle = join(uiDir, "dist-server", "server.js");
const serverMap = join(uiDir, "dist-server", "server.js.map");
if (!existsSync(serverBundle)) {
  console.error(`Server bundle not found: ${serverBundle}`);
  process.exit(1);
}
cpSync(serverBundle, join(targetDir, "server.js"));
if (existsSync(serverMap)) {
  cpSync(serverMap, join(targetDir, "server.js.map"));
}

console.log("\nUI build complete!");
console.log(`Output: ${targetDir}`);
console.log(`  - static/  (vite assets)`);
console.log(`  - server.js (bundled Hono server)`);
