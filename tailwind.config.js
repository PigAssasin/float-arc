/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { primary: "#DEDBC8" },
      fontFamily: { serif: ['"Instrument Serif"', "serif"] },
    },
  },
  plugins: [],
};
