/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Teal petróleo — derivado de la "Y" del logo (#4D8093)
        brand: {
          50:  '#f0f6f8',
          100: '#dceaef',
          200: '#bcd4dd',
          300: '#94b8c5',
          400: '#6c9aac',
          500: '#4d8093',
          600: '#3f6a7c',
          700: '#365867',
          800: '#2f4a57',
          900: '#283e49',
          950: '#19272f'
        },
        // Naranja ámbar — derivado de la "J" del logo (#E8853A)
        ember: {
          50:  '#fdf6ed',
          100: '#fae8cd',
          200: '#f5d094',
          300: '#f0b357',
          400: '#ec9a3a',
          500: '#e8853a',
          600: '#d2702e',
          700: '#ad5826',
          800: '#8a4625',
          900: '#713a23'
        },
        // Marfil/Crudo cálido — fondo principal NO blanco frío
        ivory: {
          50:  '#fdfaf5',
          100: '#f9f3e8',
          200: '#f1e5cd',
          300: '#e6d0a5',
          400: '#d6b478'
        },
        // Carbon — texto/UI cálido, NO slate frío
        carbon: {
          50:  '#f7f5f1',
          100: '#ece8df',
          200: '#d6cfc1',
          300: '#b8ad99',
          400: '#928773',
          500: '#6f6651',
          600: '#564f3f',
          700: '#3f3a2d',
          800: '#2a261d',
          900: '#1a1812'
        }
      },
      fontFamily: {
        sans:    ['"Plus Jakarta Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Bricolage Grotesque"', '"Plus Jakarta Sans"', 'sans-serif'],
        mono:    ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        // Sombras con tinte teal (no neutro)
        card:    '0 1px 2px rgba(40,62,73,0.06), 0 2px 6px rgba(40,62,73,0.06)',
        lifted:  '0 4px 12px -2px rgba(40,62,73,0.10), 0 12px 28px -8px rgba(40,62,73,0.14)',
        glow:    '0 0 0 1px rgba(77,128,147,0.15), 0 8px 24px -6px rgba(77,128,147,0.25)',
        ember:   '0 4px 16px -4px rgba(232,133,58,0.45), 0 0 0 1px rgba(232,133,58,0.20)',
        inset:   'inset 0 1px 0 rgba(255,255,255,0.6), inset 0 -1px 0 rgba(40,62,73,0.04)',
        panel:   '0 0 0 1px rgba(40,62,73,0.06), 0 24px 48px -16px rgba(40,62,73,0.18)'
      },
      backgroundImage: {
        'mesh-warm':
          'radial-gradient(at 20% 10%, rgba(232,133,58,0.18) 0px, transparent 50%), ' +
          'radial-gradient(at 80% 0%, rgba(77,128,147,0.22) 0px, transparent 50%), ' +
          'radial-gradient(at 100% 70%, rgba(232,133,58,0.10) 0px, transparent 50%), ' +
          'radial-gradient(at 0% 90%, rgba(77,128,147,0.18) 0px, transparent 50%)',
        'mesh-teal':
          'radial-gradient(at 10% 20%, rgba(77,128,147,0.45) 0px, transparent 55%), ' +
          'radial-gradient(at 80% 10%, rgba(232,133,58,0.25) 0px, transparent 50%), ' +
          'radial-gradient(at 70% 90%, rgba(40,62,73,0.55) 0px, transparent 55%), ' +
          'radial-gradient(at 0% 100%, rgba(108,154,172,0.30) 0px, transparent 50%)',
        'grid-soft':
          'linear-gradient(rgba(40,62,73,0.05) 1px, transparent 1px), ' +
          'linear-gradient(90deg, rgba(40,62,73,0.05) 1px, transparent 1px)',
        'diag-stripes':
          'repeating-linear-gradient(45deg, rgba(77,128,147,0.04) 0 1px, transparent 1px 14px)',
        'shimmer':
          'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)'
      },
      backgroundSize: {
        'grid-24': '24px 24px',
        'grid-32': '32px 32px',
        'shimmer-big': '200% 100%'
      },
      keyframes: {
        'rise': {
          '0%':   { transform: 'translateY(12px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' }
        },
        'rise-sm': {
          '0%':   { transform: 'translateY(6px)',  opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' }
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' }
        },
        'modal-in': {
          '0%':   { transform: 'translateY(16px) scale(.97)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)',      opacity: '1' }
        },
        'toast-in': {
          '0%':   { transform: 'translateX(110%) scale(.95)', opacity: '0' },
          '100%': { transform: 'translateX(0) scale(1)',      opacity: '1' }
        },
        'elev-up': {
          '0%':   { transform: 'translateY(0)' },
          '50%':  { transform: 'translateY(-60%)' },
          '50.01%': { transform: 'translateY(60%)' },
          '100%': { transform: 'translateY(0)' }
        },
        'chev-up': {
          '0%, 100%': { transform: 'translateY(2px)', opacity: '0.4' },
          '50%':      { transform: 'translateY(-2px)', opacity: '1' }
        },
        'chev-down': {
          '0%, 100%': { transform: 'translateY(-2px)', opacity: '0.4' },
          '50%':      { transform: 'translateY(2px)', opacity: '1' }
        },
        'shimmer': {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' }
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':      { transform: 'translateY(-8px)' }
        },
        'pulse-ring': {
          '0%':   { transform: 'scale(.85)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' }
        },
        'progress': {
          '0%':   { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' }
        },
        'shine-sweep': {
          '0%, 100%': { transform: 'translateX(-160%) skewX(-20deg)' },
          '35%':      { transform: 'translateX(160%)  skewX(-20deg)' }
        }
      },
      animation: {
        'rise':       'rise .55s cubic-bezier(.2,.7,.2,1) both',
        'rise-sm':    'rise-sm .35s cubic-bezier(.2,.7,.2,1) both',
        'fade-in':    'fade-in .35s ease-out both',
        'modal-in':   'modal-in .35s cubic-bezier(.2,.7,.2,1) both',
        'toast-in':   'toast-in .45s cubic-bezier(.2,.7,.2,1) both',
        'elev-up':    'elev-up 2.6s ease-in-out infinite',
        'chev-up':    'chev-up 1.6s ease-in-out infinite',
        'chev-down':  'chev-down 1.6s ease-in-out infinite .8s',
        'shimmer':    'shimmer 1.8s linear infinite',
        'spin-slow':  'spin-slow 8s linear infinite',
        'float':      'float 6s ease-in-out infinite',
        'pulse-ring': 'pulse-ring 1.6s cubic-bezier(.5,0,.5,1) infinite',
        'progress':   'progress 3.5s linear forwards',
        'shine':      'shine-sweep 6s ease-in-out 1.5s infinite'
      }
    }
  },
  plugins: []
};
