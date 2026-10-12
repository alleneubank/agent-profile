import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";
import { PROCESS_TIMEOUT_MS } from "./tests/process-timeout";

export default defineConfig({
  test: {
    testTimeout: PROCESS_TIMEOUT_MS,
    hookTimeout: PROCESS_TIMEOUT_MS,
    // Each worker also spawns shells and git; bound fan-out on large hosts.
    maxWorkers: Math.min(2, availableParallelism()),
  },
});
