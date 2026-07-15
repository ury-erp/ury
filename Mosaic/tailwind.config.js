/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,jsx,tsx,vue,js,ts}"],
  theme: {
    extend: {
      spacing: {
        '28': '28px', // Define a custom margin-top value
      },
    },
  },
  plugins: [],
}

