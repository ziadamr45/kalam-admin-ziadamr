import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // هوية لوحة التحكم السيادية — كحلي فولاذي + نحاسي
        steel: {
          50: "#F4F6F9",
          100: "#E6EAF1",
          200: "#CBD4E2",
          300: "#9DAEC8",
          400: "#66809F",
          500: "#41587A",
          600: "#2C4160",
          700: "#1F3050",
          800: "#152238",
          900: "#0D1626",
          950: "#070E19",
        },
        copper: {
          50: "#FBF6EA",
          100: "#F5EBD3",
          300: "#E8C87E",
          400: "#D9A441",
          500: "#C08A2D",
          600: "#A16A1F",
          700: "#84531B",
        },
        danger: {
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
        },
        success: {
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
        },
        warn: {
          400: "#FBBF24",
          500: "#F59E0B",
        },
      },
      fontFamily: {
        ui: ["var(--font-ui)", "Readex Pro", "sans-serif"],
      },
      borderRadius: { xl2: "1rem" },
      boxShadow: {
        soft: "0 2px 20px -6px rgba(13, 22, 38, 0.10)",
        lift: "0 12px 40px -12px rgba(13, 22, 38, 0.22)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: { "fade-up": "fade-up 0.4s cubic-bezier(0.22,1,0.36,1) both" },
      transitionTimingFunction: { fluid: "cubic-bezier(0.22, 1, 0.36, 1)" },
    },
  },
  plugins: [],
};

export default config;
