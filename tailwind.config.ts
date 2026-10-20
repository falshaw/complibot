import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#6366f1",
          light: "#818cf8",
          dark: "#4f46e5",
          darker: "#3730a3",
        },
        navy: {
          DEFAULT: "#0f172a",
          dark: "#020617",
          mid: "#1e293b",
          light: "#334155",
        },
        accent: {
          green: "#10b981",
          amber: "#f59e0b",
          red: "#ef4444",
          cyan: "#06b6d4",
        },
      },
      backgroundImage: {
        "hero-gradient":
          "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)",
        "brand-gradient": "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
        "brand-gradient-hover":
          "linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)",
      },
      boxShadow: {
        brand: "0 8px 24px rgba(99, 102, 241, 0.3)",
        "brand-lg": "0 12px 32px rgba(99, 102, 241, 0.4)",
      },
      borderRadius: {
        card: "16px",
        button: "8px",
        input: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
