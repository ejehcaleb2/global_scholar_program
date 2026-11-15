import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    colors: {
      primary: "#0056E2",
      background: "#FFFFFF",
      "surface-alt": "#F7F8FA",
      text: "#333333",
      border: "#E0E0E0",
      "status-success": "#17803D",
    },
    fontFamily: {
      heading: ["Fraunces", "Georgia", "serif"],
      body: ["Source Sans 3", "Arial", "sans-serif"],
    },
    borderRadius: {
      DEFAULT: "8px",
    },
  },
  plugins: [],
};

export default config;
