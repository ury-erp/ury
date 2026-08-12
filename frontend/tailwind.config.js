import preset from '@ury/ui/tailwind-preset'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "../packages/ui/src/**/*.{ts,tsx}",
  ],
  presets: [preset],
  theme: {
    extend: {},
  },
  plugins: [],
}
