import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      keyframes: {
        "premiere-glow": {
          "0%, 100%": { boxShadow: "0 0 0 1px rgba(250,204,21,0.6), 0 0 12px 0 rgba(250,204,21,0.25)" },
          "50%": { boxShadow: "0 0 0 1px rgba(250,204,21,0.9), 0 0 22px 2px rgba(250,204,21,0.5)" },
        },
      },
      animation: {
        "premiere-glow": "premiere-glow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
