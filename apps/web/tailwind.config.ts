import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── App canvas ─────────────────────────────────────────────────────
        canvas: '#F7F4EF',

        // ── Surfaces ───────────────────────────────────────────────────────
        surface: {
          DEFAULT: '#FCFAF7',
          subtle: '#F1ECE5',
          hover: '#EAE3DA',
        },

        // ── Borders ────────────────────────────────────────────────────────
        border: {
          DEFAULT: '#D9D1C7',
          strong: '#C8BEB2',
          subtle: '#E8E2DA',
        },

        // ── Text ───────────────────────────────────────────────────────────
        ink: {
          DEFAULT: '#2B2621',
          muted: '#6F685F',
          faint: '#8A8178',
        },

        // ── Primary warm brown ─────────────────────────────────────────────
        // Also aliased as `brand` for backward-compat with existing page classes
        primary: {
          DEFAULT: '#7B5A43',
          hover: '#644733',
          soft: '#E8D9CB',
        },
        brand: {
          DEFAULT: '#7B5A43',
          light: '#9A7456',
          dark: '#644733',
        },

        // ── Secondary beige accent ─────────────────────────────────────────
        accent: {
          DEFAULT: '#D8C2A8',
          soft: '#EFE2D3',
        },

        // ── Grey UI ────────────────────────────────────────────────────────
        'grey-ui': '#A8B0B7',
        'grey-soft': '#E5E8EB',

        // ── Semantic states ────────────────────────────────────────────────
        info: {
          DEFAULT: '#6B7280',
          soft: '#ECE8E3',
        },
        success: {
          DEFAULT: '#5E7A5F',
          soft: '#DCE8DC',
        },
        warning: {
          DEFAULT: '#A06A3B',
          soft: '#F3E2CF',
        },
        danger: {
          DEFAULT: '#A14B3B',
          soft: '#F2D9D4',
        },
        blocked: {
          DEFAULT: '#7A3E2B',
          soft: '#EFD6CF',
        },

        // ── Sidebar (warm dark) ────────────────────────────────────────────
        sidebar: {
          bg: '#1E1612',
          hover: '#2C241E',
          active: '#7B5A43',
          border: '#2E251F',
          text: '#A89D91',
          'text-active': '#F3EEE8',
        },
      },

      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },

      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['15px', { lineHeight: '22px' }],
        md: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '28px' }],
        xl: ['20px', { lineHeight: '30px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
      },

      boxShadow: {
        card: '0 1px 2px rgba(43, 38, 33, 0.04), 0 8px 24px rgba(43, 38, 33, 0.05)',
        modal: '0 16px 48px rgba(43, 38, 33, 0.18)',
        'card-hover': '0 2px 4px rgba(43, 38, 33, 0.06), 0 12px 32px rgba(43, 38, 33, 0.08)',
      },

      borderRadius: {
        // Override key sizes for spec compliance
        // inputs/buttons = 8px (rounded-lg)
        // cards/panels   = 12px (rounded-xl)
        // modals         = 14px (rounded-modal)
        // pills          = 999px (rounded-full)
        modal: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
