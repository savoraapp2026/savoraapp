/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./public/faq.html",
    "./public/partner.html",
    "./public/contact.html",
    "./public/index.html",
    "./public/early-access.html"
  ],
  theme: {
    extend: {
      colors: {
        sav: {
          green: '#10B981', greenD: '#059669', greenL: '#D1FAE5',
          dark: '#0F172A', dark8: '#1E293B', dark7: '#334155',
          gray: '#64748B', grayL: '#94A3B8', grayB: '#E2E8F0', grayS: '#F1F5F9',
          light: '#F8FAFC', white: '#FFFFFF',
          yellow: '#F59E0B', rose: '#F43F5E', purple: '#8B5CF6', sky: '#0EA5E9',
        }
      },
      fontFamily: { inter: ['Inter','system-ui','sans-serif'] }
    }
  },
  plugins: []
}
