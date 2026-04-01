/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#e8f0fb',
          100: '#c5d6f5',
          500: '#1d4e89',
          600: '#17407a',
          700: '#10316b',
          900: '#0a1f4a',
        }
      }
    }
  },
  corePlugins: {
    preflight: false,
  },
  prefix: 'tw-',
}
