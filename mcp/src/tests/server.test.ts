/**
 * Integration tests for MCP server
 * 
 * Note: These tests use execute() directly instead of going through
 * the MCP server request handling to avoid needing a connected transport.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execute } from "../executor.js";

describe("MCP Server Execute Tool", () => {
  describe("Basic Execution", () => {
    it("should execute simple return statement", async () => {
      const result = await execute("return 42;");
      assert.equal(result, 42);
    });

    it("should execute async code with await", async () => {
      const result = await execute(`
        const promise = Promise.resolve("hello");
        return await promise;
      `);
      assert.equal(result, "hello");
    });

    it("should return object results", async () => {
      const result = await execute('return { id: "123", name: "test" };') as Record<string, unknown>;
      // Check properties instead of deep equality due to VM context
      assert.equal(result.id, "123");
      assert.equal(result.name, "test");
    });
  });

  describe("Error Handling", () => {
    it("should handle syntax errors in code", async () => {
      try {
        await execute("return {{{;");
        assert.fail("Should have thrown");
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.length > 0);
      }
    });

    it("should handle runtime errors", async () => {
      try {
        await execute('throw new Error("test error");');
        assert.fail("Should have thrown");
      } catch (err) {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes("test error"));
      }
    });
  });
});
