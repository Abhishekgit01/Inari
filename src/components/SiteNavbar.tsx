import { motion } from 'framer-motion';



export function SiteNavbar() {
  return (
    <div style={{ position: 'absolute', top: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100, width: '100%', maxWidth: '1200px', padding: '0 16px' }}>
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderRadius: 9999,
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#fff',
        }}
      >
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '0.15em', color: '#e2e8f0', fontFamily: '"Inter", sans-serif' }}>
            INARI
          </span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/features" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>Features</a>
          <a href="/technology" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>Technology</a>
          <a href="/blogs" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>Blogs</a>
          <a href="/about" style={{ textDecoration: 'none', fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.7)', transition: 'color 150ms', fontFamily: '"Inter", sans-serif' }} onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>About Us</a>
        </div>

        <a
          href="/login"
          style={{
            textDecoration: 'none',
            background: 'transparent',
            color: '#e2e8f0',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '8px 20px',
            borderRadius: 9999,
            fontSize: 13,
            fontWeight: 500,
            transition: 'all 150ms',
            fontFamily: '"Inter", sans-serif',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          Get a demo
        </a>
      </motion.nav>
    </div>
  );
}
