import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background:       '#0a0a09',
        surface:          'rgba(255, 255, 255, 0.02)',
        'surface-border': 'rgba(255, 255, 255, 0.07)',
        accent:           '#c8a96e',
        primary:          '#ffffff',
        secondary:        'rgba(255, 255, 255, 0.45)',
        muted:            'rgba(255, 255, 255, 0.25)',
        log:              'rgba(255, 255, 255, 0.65)',
      },
      fontWeight: {
        light: '300',
      },
      letterSpacing: {
        label: '0.16em',
      },
      fontSize: {
        label: '9px',
      },
    },
  },
  plugins: [],
};

export default config;
