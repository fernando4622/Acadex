/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f8ff',
          100: '#cfe2ff',
          200: '#9ec5fe',
          300: '#6ea8fe',
          400: '#3d8bfd',
          500: '#0d6efd',
          600: '#0a58ca',
          700: '#084298',
          800: '#052c65',
          900: '#031633',
          950: '#010b1a',
        },
        darkBlue: '#002199',
        darkerBlue: '#002159',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn .2s ease-out',
        'slide-up': 'slideUp .25s ease-out',
        'slide-down': 'slideDown .2s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        slideDown: { from: { opacity: 0, transform: 'translateY(-8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: .6 } },
      },
      boxShadow: {
        'card': '0 1px 3px rgb(0 0 0/.06),0 1px 2px rgb(0 0 0/.04)',
        'card-md': '0 4px 12px rgb(0 0 0/.08)',
        'card-lg': '0 8px 32px rgb(0 0 0/.12)',
        'inner-sm': 'inset 0 1px 2px rgb(0 0 0/.06)',
        'glow': '0 0 24px rgb(13 110 253/.25)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh': 'radial-gradient(at 40% 20%, rgb(13 110 253/.15) 0px, transparent 50%), radial-gradient(at 80% 0%, rgb(13 160 253/.1) 0px, transparent 50%), radial-gradient(at 0% 50%, rgb(61 139 253/.1) 0px, transparent 50%)',
      },
    },
  },
  plugins: [],
}
