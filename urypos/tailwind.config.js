/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{html,jsx,tsx,vue,js,ts}",'node_modules/flowbite-vue/**/*.{js,jsx,ts,tsx}',
  'node_modules/flowbite/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [ require('flowbite/plugin')],
}