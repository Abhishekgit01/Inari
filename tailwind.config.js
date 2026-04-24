/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './Front/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        surface: '#111417',
        'surface-container-low': '#191c1f',
        'surface-container-high': '#282a2e',
        'surface-container-highest': '#323539',
        'surface-container-lowest': '#0c0e12',
        'surface-variant': '#323539',
        'surface-dim': '#111417',
        'surface-bright': '#37393d',
        primary: '#b0c6ff',
        'primary-container': '#568dff',
        'on-primary': '#002d6f',
        'on-primary-container': '#002661',
        secondary: '#a6e6ff',
        'secondary-container': '#14d1ff',
        'on-secondary': '#003543',
        'on-secondary-container': '#00566b',
        tertiary: '#ceca7c',
        'on-surface': '#e1e2e7',
        'on-surface-variant': '#c2c6d8',
        outline: '#8c90a1',
        'outline-variant': '#424655',
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};
