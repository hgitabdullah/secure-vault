/** Tailwind is used for small layout utilities; the design system lives in src/design.css. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: ['class', 'html:not(.light)'],
  corePlugins: { preflight: false }, // design.css already provides the reset
  theme: { extend: { colors: { primary: '#6366F1', accent: '#22D3EE', violet: '#8B5CF6' } } },
};
