import type { Config } from "tailwindcss";

/**
 * Every design value the app can reach for, bound by name to the custom
 * properties in `tokens.css`. Utility classes are the delivery mechanism; the
 * tokens are the system. A raw colour, font or size written inline in a
 * component is a bug — add it here first, then use the name.
 *
 * The spacing scale is named by role rather than by step count. `gap-lg` says
 * what a gap is for; `gap-6` says how big it happens to be today. Tailwind's
 * numeric steps stay available underneath for the odd optical nudge.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--color-paper)",
        "paper-2": "var(--color-paper-2)",
        "paper-3": "var(--color-paper-3)",
        rule: "var(--color-rule)",
        "rule-strong": "var(--color-rule-strong)",
        muted: "var(--color-muted)",
        ink: "var(--color-ink)",
        accent: "var(--color-accent)",
        "accent-ink": "var(--color-accent-ink)",
        scrim: "var(--color-scrim)",
      },
      spacing: {
        "3xs": "var(--space-3xs)",
        "2xs": "var(--space-2xs)",
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "2xl": "var(--space-2xl)",
        "3xl": "var(--space-3xl)",
      },
      fontFamily: {
        display: "var(--font-display)",
        body: "var(--font-body)",
        mono: "var(--font-mono)",
      },
      fontSize: {
        xs: "var(--text-xs)",
        sm: "var(--text-sm)",
        base: "var(--text-base)",
        head: "var(--text-head)",
        mast: "var(--text-mast)",
      },
      borderRadius: {
        none: "var(--radius-none)",
        sm: "var(--radius-sm)",
      },
      borderWidth: {
        hair: "var(--rule-hair)",
        strong: "var(--rule-strong)",
      },
      height: {
        // The heavy rule weight, for elements that *are* a rule rather than a
        // box with a border: the masthead double rule and the progress bar.
        "rule-double": "var(--rule-double)",
      },
      transitionTimingFunction: {
        out: "var(--ease-out)",
        in: "var(--ease-in)",
        "in-out": "var(--ease-in-out)",
      },
      transitionDuration: {
        micro: "var(--dur-micro)",
        short: "var(--dur-short)",
        long: "var(--dur-long)",
      },
      zIndex: {
        base: "var(--z-base)",
        raised: "var(--z-raised)",
        sticky: "var(--z-sticky)",
      },
    },
  },
  plugins: [],
};

export default config;
