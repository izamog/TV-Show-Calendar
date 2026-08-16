import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Pure date/timezone + iCal logic — no DOM needed.
    environment: "node",
    include: ["lib/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // lcov is what the Codacy reporter consumes; text keeps the summary
      // visible in the terminal and in the CI log without opening artefacts.
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
      // Coverage is scoped to lib/ on purpose. lib/ holds all the logic and
      // all the tests; app/ and components/ are thin presentation over it and
      // are deliberately not unit-tested. Measuring them would report a number
      // that says "the rendering layer is untested" — a known and accepted
      // choice, not a gap worth re-reporting on every build.
      include: ["lib/**/*.ts"],
      // types.ts is type declarations only. It compiles away to nothing, so
      // v8 reports it as 0% covered forever — an artefact, not a real gap.
      exclude: ["lib/**/*.test.ts", "lib/types.ts"],
      // Report on files no test imports at all — otherwise a module that loses
      // its last test silently vanishes from the denominator instead of
      // showing up as 0%.
      all: true,
    },
  },
});
