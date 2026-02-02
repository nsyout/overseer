#!/usr/bin/env node
/**
 * Integration test for bundled UI
 * 
 * Tests that the bundled UI server starts and serves correctly.
 * Run after building the npm package.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const binPath = join(__dirname, "../overseer/bin/os");
const PORT = 19876; // Use unusual port to avoid conflicts

/**
 * Fetch with timeout
 */
async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Wait for server to be ready
 */
async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetchWithTimeout(url, 1000);
      if (response.ok) return true;
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return false;
}

async function main() {
  console.log("Testing bundled UI server...\n");

  // Check binary exists
  if (!existsSync(binPath)) {
    console.error(`Binary not found: ${binPath}`);
    process.exit(1);
  }

  // Check UI bundle exists
  const uiServer = join(__dirname, "../overseer/dist/ui/server.js");
  if (!existsSync(uiServer)) {
    console.error(`UI server not found: ${uiServer}`);
    console.error("Run 'node npm/scripts/build-ui.mjs' first");
    process.exit(1);
  }

  // Start server
  console.log(`Starting server on port ${PORT}...`);
  const server = spawn("node", [binPath, "ui", String(PORT)], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      // Don't need CLI for this test - set a dummy path
      OVERSEER_CLI_PATH: "/bin/echo",
    },
  });

  let stdout = "";
  let stderr = "";
  server.stdout.on("data", (data) => {
    stdout += data.toString();
    process.stdout.write(data);
  });
  server.stderr.on("data", (data) => {
    stderr += data.toString();
    process.stderr.write(data);
  });

  // Handle server exit
  const serverExited = new Promise((resolve) => {
    server.on("exit", (code) => {
      resolve(code);
    });
  });

  try {
    // Wait for server to start
    const baseUrl = `http://localhost:${PORT}`;
    const ready = await waitForServer(`${baseUrl}/health`);
    if (!ready) {
      throw new Error("Server failed to start within timeout");
    }

    console.log("\nRunning tests...\n");

    // Test 1: Health endpoint
    console.log("1. Testing /health endpoint...");
    const healthRes = await fetchWithTimeout(`${baseUrl}/health`);
    if (!healthRes.ok) {
      throw new Error(`Health check failed: ${healthRes.status}`);
    }
    const healthData = await healthRes.json();
    if (healthData.status !== "ok") {
      throw new Error(`Unexpected health response: ${JSON.stringify(healthData)}`);
    }
    console.log("   PASS: /health returns { status: 'ok' }");

    // Test 2: Static index.html
    console.log("2. Testing / (index.html)...");
    const indexRes = await fetchWithTimeout(baseUrl);
    if (!indexRes.ok) {
      throw new Error(`Index page failed: ${indexRes.status}`);
    }
    const indexHtml = await indexRes.text();
    if (!indexHtml.includes("<!DOCTYPE html>")) {
      throw new Error("Index page doesn't look like HTML");
    }
    if (!indexHtml.includes("Overseer")) {
      throw new Error("Index page missing 'Overseer' title");
    }
    console.log("   PASS: / returns HTML with expected content");

    // Test 3: Static assets (CSS/JS)
    console.log("3. Testing static assets...");
    // Extract asset paths from HTML
    const jsMatch = indexHtml.match(/src="([^"]*\.js)"/);
    const cssMatch = indexHtml.match(/href="([^"]*\.css)"/);
    
    if (jsMatch) {
      const jsRes = await fetchWithTimeout(`${baseUrl}${jsMatch[1]}`);
      if (!jsRes.ok) {
        throw new Error(`JS asset failed: ${jsRes.status}`);
      }
      console.log(`   PASS: JS asset loads (${jsMatch[1]})`);
    }
    
    if (cssMatch) {
      const cssRes = await fetchWithTimeout(`${baseUrl}${cssMatch[1]}`);
      if (!cssRes.ok) {
        throw new Error(`CSS asset failed: ${cssRes.status}`);
      }
      console.log(`   PASS: CSS asset loads (${cssMatch[1]})`);
    }

    // Test 4: SPA fallback (unknown path should return index.html)
    console.log("4. Testing SPA fallback...");
    const spaRes = await fetchWithTimeout(`${baseUrl}/some/random/path`);
    if (!spaRes.ok) {
      throw new Error(`SPA fallback failed: ${spaRes.status}`);
    }
    const spaHtml = await spaRes.text();
    if (!spaHtml.includes("<!DOCTYPE html>")) {
      throw new Error("SPA fallback doesn't return index.html");
    }
    console.log("   PASS: Unknown paths return index.html");

    // Test 5: API 404
    console.log("5. Testing API 404...");
    const api404Res = await fetchWithTimeout(`${baseUrl}/api/unknown`);
    if (api404Res.status !== 404) {
      throw new Error(`Expected 404, got ${api404Res.status}`);
    }
    console.log("   PASS: /api/unknown returns 404");

    console.log("\n All tests passed!");

  } finally {
    // Cleanup
    console.log("\nStopping server...");
    server.kill("SIGTERM");
    await Promise.race([
      serverExited,
      new Promise((resolve) => setTimeout(resolve, 2000)),
    ]);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
  }
}

main().catch((err) => {
  console.error(`\n FAILED: ${err.message}`);
  process.exit(1);
});
