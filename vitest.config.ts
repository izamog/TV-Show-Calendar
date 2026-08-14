import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure date/timezone + iCal logic — no DOM needed.
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
});
