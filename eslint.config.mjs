import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// Next 16 removed `next lint`, so linting runs through the ESLint CLI against
// this flat config. eslint-config-next ships flat-native from v16, so it is
// spread in directly — no FlatCompat shim needed.
const config = [
  {
    // Flat config ignores nothing but node_modules by default, so build output
    // and the coverage report have to be excluded or ESLint walks thousands of
    // generated files.
    ignores: [".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"],
  },
  ...nextCoreWebVitals,
];

export default config;
