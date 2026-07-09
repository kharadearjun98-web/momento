/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'memento-purple': {
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7e22ce',
        },
        'memento-accent-cyan': '#22d3ee',
        'memento-accent-blue': '#3b82f6',
        'memento-accent-pink': '#ec4899',
        'primary': '#8c2bee',
        'background-dark': '#191022',
        'surface-dark': '#0f0f12',
      },
      fontFamily: {
        display: ['Space Grotesk', 'Inter', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow': '0 0 20px rgba(168, 85, 247, 0.4)',
        'glass': '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(145deg, rgba(139, 92, 246, 0.03) 0%, rgba(139, 92, 246, 0.01) 100%)',
      },
      animation: {
        'scroll-slow': 'scroll-vertical 80s linear infinite',
        'scroll-medium': 'scroll-vertical 65s linear infinite',
        'scroll-fast': 'scroll-vertical 50s linear infinite',
      },
      keyframes: {
        'scroll-vertical': {
          '0%': { transform: 'translateY(0)' },
          '100%': { transform: 'translateY(-50%)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

