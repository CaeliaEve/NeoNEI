/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // AE2 / GTNH inspired colors
        'ae-blue': '#3b6caa',
        'ae-dark': '#1a1a2e',
        'ae-light': '#4a90e2',
      },
      backdropBlur: {
        xs: '2px',
      },
      screens: {
        // 自定义断点
        'xs': '375px',    // 小屏手机
        'sm': '640px',    // 平板竖屏
        'md': '768px',    // 平板横屏
        'lg': '1024px',   // 小笔记本
        'xl': '1280px',   // 桌面
        '2xl': '1536px',  // 大屏
      },
      gridTemplateColumns: {
        // 物品网格的特殊列数
        '13': 'repeat(13, minmax(0, 1fr))',
        '15': 'repeat(15, minmax(0, 1fr))',
        '16': 'repeat(16, minmax(0, 1fr))',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      }
    },
  },
  plugins: [],
}
