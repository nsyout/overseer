/**
 * Unit tests for VM sandbox executor
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execute, ExecutionError } from "../executor.js";

describe("VM Executor", () => {
  describe("Basic Execution", () => {
    it("should execute simple return", async () => {
      const result = await execute("return 42;");
      assert.equal(result, 42);
    });

    it("should execute arithmetic", async () => {
      const result = await execute("return 10 + 20;");
      assert.equal(result, 30);
    });

    it("should execute string operations", async () => {
      const result = await execute('return "hello" + " " + "world";');
      assert.equal(result, "hello world");
    });

    it("should execute object creation", async () => {
      const result = await execute('return { a: 1, b: "test" };') as Record<string, unknown>;
      // VM context objects have different prototypes - check properties
      assert.equal(result.a, 1);
      assert.equal(result.b, "test");
    });

    it("should execute array operations", async () => {
      const result = await execute("return [1, 2, 3].map(x => x * 2);") as number[];
      // VM context arrays have different prototypes - check elements
      assert.equal(result.length, 3);
      assert.equal(result[0], 2);
      assert.equal(result[1], 4);
      assert.equal(result[2], 6);
    });
  });

  describe("Async Support", () => {
    it("should handle Promise.resolve", async () => {
      const result = await execute('return await Promise.resolve("async");');
      assert.equal(result, "async");
    });

    it("should handle setTimeout in Promise", async () => {
      const result = await execute(`
        return await new Promise(resolve => {
          setTimeout(() => resolve("delayed"), 10);
        });
      `);
      assert.equal(result, "delayed");
    });

    it("should handle multiple awaits", async () => {
      const result = await execute(`
        const a = await Promise.resolve(1);
        const b = await Promise.resolve(2);
        return a + b;
      `);
      assert.equal(result, 3);
    });

    it("should handle async functions", async () => {
      const result = await execute(`
        async function helper() {
          return await Promise.resolve(42);
        }
        return await helper();
      `);
      assert.equal(result, 42);
    });
  });

  describe("Variable Scope", () => {
    it("should support const declarations", async () => {
      const result = await execute(`
        const x = 10;
        const y = 20;
        return x + y;
      `);
      assert.equal(result, 30);
    });

    it("should support let declarations", async () => {
      const result = await execute(`
        let counter = 0;
        counter++;
        counter++;
        return counter;
      `);
      assert.equal(result, 2);
    });

    it("should support function declarations", async () => {
      const result = await execute(`
        function add(a, b) {
          return a + b;
        }
        return add(5, 7);
      `);
      assert.equal(result, 12);
    });
  });

  describe("Error Handling", () => {
    it("should throw ExecutionError on syntax error", async () => {
      await assert.rejects(
        async () => await execute("return {{{;"),
        ExecutionError
      );
    });

    it("should throw ExecutionError on runtime error", async () => {
      await assert.rejects(
        async () => await execute('throw new Error("test");'),
        ExecutionError
      );
    });

    it("should throw ExecutionError on undefined variable", async () => {
      await assert.rejects(
        async () => await execute("return undefinedVar;"),
        ExecutionError
      );
    });

    it("should include error message in ExecutionError", async () => {
      try {
        await execute('throw new Error("test error");');
        assert.fail("Should have thrown");
      } catch (err) {
        assert.ok(err instanceof ExecutionError);
        assert.ok(err.message.includes("test error"));
        // Stack trace may be undefined depending on error type
      }
    });
  });

  describe("Output Truncation", () => {
    it("should not truncate small outputs", async () => {
      const result = await execute('return "small output";');
      assert.equal(result, "small output");
    });

    it("should truncate large outputs", async () => {
      const result = await execute(`
        const largeArray = Array(10000).fill("x".repeat(100));
        return largeArray;
      `);

      assert.ok(typeof result === "object" && result !== null);
      const obj = result as Record<string, unknown>;
      assert.equal(obj._truncated, true);
      assert.ok(obj.size);
      assert.ok(obj.preview);
      assert.ok(obj.message);
    });
  });

  describe("Sandbox Isolation", () => {
    it("should not have access to process", async () => {
      await assert.rejects(
        async () => await execute("return process.env;"),
        ExecutionError
      );
    });

    it("should not have access to require", async () => {
      await assert.rejects(
        async () => await execute('return require("fs");'),
        ExecutionError
      );
    });

    it("should not have access to global", async () => {
      await assert.rejects(
        async () => await execute("return global.process;"),
        ExecutionError
      );
    });

    it("should have access to console", async () => {
      // Should not throw
      const result = await execute(`
        console.log("test message");
        return "ok";
      `);
      assert.equal(result, "ok");
    });
  });

  describe("Timeout", () => {
    it.skip("should timeout after 30s (skipped - slow)", async () => {
      await assert.rejects(
        async () => {
          await execute(`
            // Infinite loop
            while(true) {}
          `);
        },
        (err: Error) => {
          assert.ok(
            err.message.includes("timeout") ||
              err.message.includes("timed out")
          );
          return true;
        }
      );
    });
  });
});
