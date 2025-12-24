import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0, 0, 0, 0.03)',
        'glow': '0 4px 20px -2px rgba(99, 102, 241, 0.1)',     // Indigo glow
        'glow-lg': '0 10px 40px -4px rgba(99, 102, 241, 0.15)', // Larger Indigo glow
        'glow-card': '0 4px 12px -2px rgba(0, 0, 0, 0.05), 0 2px 6px -1px rgba(0, 0, 0, 0.02)', // Card subtle shadow
      },
    },
  },
  plugins: [],
};
export default config;




