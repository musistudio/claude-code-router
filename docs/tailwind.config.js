/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#CC7C5E',
          50: '#FEF6F3',
          100: '#FDE8E0',
          200: '#FBD2C1',
          300: '#F7AC92',
          400: '#F28B68',
          500: '#CC7C5E',
          600: '#BC5C3E',
          700: '#964630',
          800: '#7A3B2C',
          900: '#643528',
        },
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            '--tw-prose-body': theme('colors.neutral.800'),
            '--tw-prose-headings': theme('colors.neutral.900'),
            '--tw-prose-links': theme('colors.primary.600'),
            '--tw-prose-bold': theme('colors.neutral.900'),
            '--tw-prose-counters': theme('colors.primary.600'),
            '--tw-prose-bullets': theme('colors.primary.600'),
            '--tw-prose-hr': theme('colors.neutral.300'),
            '--tw-prose-quotes': theme('colors.neutral.900'),
            '--tw-prose-quote-borders': theme('colors.primary.600'),
            '--tw-prose-code': theme('colors.primary.600'),
            '--tw-prose-pre-code': theme('colors.neutral.200'),
            '--tw-prose-pre-bg': theme('colors.neutral.800'),
            '--tw-prose-th-borders': theme('colors.neutral.300'),
            '--tw-prose-td-borders': theme('colors.neutral.200'),
          },
        },
      }),
      animation: {
        'fade-in-up': 'fadeInUp 0.6s ease-out',
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-in': 'slideIn 0.6s ease-out',
      },
      keyframes: {
        fadeInUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
