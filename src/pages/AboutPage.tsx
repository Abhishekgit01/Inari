import { motion } from 'framer-motion';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';

export function AboutPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e1e2e7', position: 'relative', overflow: 'hidden' }}>
      {/* Background Glow */}
      <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(0, 229, 255, 0.08) 0%, rgba(8, 14, 28, 0) 70%)', filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0 }} />
      
      <SiteNavbar />

      <main style={{ position: 'relative', zIndex: 10, paddingTop: '160px', paddingBottom: '80px', maxWidth: 800, margin: '0 auto', paddingInline: '24px' }}>
        
        <motion.section 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        >
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }} padding="64px 48px">
          <h1 style={{ fontSize: '36px', fontWeight: 600, fontFamily: '"Inter", sans-serif', color: '#fff', marginBottom: '24px' }}>
            About Us
          </h1>
          
          <p style={{ color: '#e2e8f0', fontSize: '18px', lineHeight: 1.8, marginBottom: '40px' }}>
            We are Abhishek R P and GiGI Koneti — developers who want to build a secure world. We believe that cyber defense shouldn't rely on opaque, legacy rulebooks. It should be autonomous, transparent, and built to adapt in real-time.
          </p>
          
          <div style={{ display: 'flex', justifyContent: 'center', gap: '24px' }}>
            <a href="#" style={{ 
              display: 'inline-block',
              padding: '12px 24px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '99px',
              color: '#00e5ff', 
              textDecoration: 'none',
              fontFamily: '"Inter", sans-serif',
              fontWeight: 500,
              transition: 'background 0.3s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Abhishek's Socials ↗
            </a>
            <a href="#" style={{ 
              display: 'inline-block',
              padding: '12px 24px',
              border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '99px',
              color: '#00e5ff', 
              textDecoration: 'none',
              fontFamily: '"Inter", sans-serif',
              fontWeight: 500,
              transition: 'background 0.3s'
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              GiGI's Socials ↗
            </a>
          </div>
          </FrostGlass>
        </motion.section>

      </main>
    </div>
  );
}
