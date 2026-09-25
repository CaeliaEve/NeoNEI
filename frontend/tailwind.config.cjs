/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        'ae-blue': '#3b6caa',
        'ae-dark': '#1a1a2e',
        'ae-light': '#4a90e2',
      },
      backdropBlur: {
        xs: '2px',
      },
      screens: {
        xs: '375px',
        sm: '640px',
        md: '768px',
        lg: '1024px',
        xl: '1280px',
        '2xl': '1536px',
      },
      gridTemplateColumns: {
        13: 'repeat(13, minmax(0, 1fr))',
        15: 'repeat(15, minmax(0, 1fr))',
        16: 'repeat(16, minmax(0, 1fr))',
      },
      spacing: {
        18: '4.5rem',
        22: '5.5rem',
      },
    },
  },
  plugins: [],
};
