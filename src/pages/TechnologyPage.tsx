import { motion } from 'framer-motion';
import { SiteNavbar } from '../components/SiteNavbar';
import { ArrowRight } from 'lucide-react';
import { FrostGlass } from '../components/FrostGlass';
export function TechnologyPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#111216', color: '#fff', paddingBottom: '120px' }}>
      <SiteNavbar />
      
      <main style={{ paddingTop: '160px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '80px', paddingInline: '24px' }}>
        
        {/* Card: Built for the Architect */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        >
          <FrostGlass style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 1fr) 1.5fr', gap: '48px', alignItems: 'start' }} padding="48px">
          {/* Left Column */}
          <div style={{ paddingTop: '12px' }}>
            <h2 style={{ fontSize: '42px', fontWeight: 700, fontFamily: '"Inter", sans-serif', color: '#fff', lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-0.02em' }}>
              Built for the<br />
              <span style={{ color: '#00e5ff' }}>Architect.</span>
            </h2>
            <p style={{ color: '#a1a1aa', fontSize: '15px', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '40px' }}>
              Deeply integrated, low-latency infrastructure designed to fit into your existing DevOps pipelines without friction.
            </p>
            <a href="#" style={{ display: 'inline-flex', alignItems: 'center', color: '#fff', fontSize: '14px', fontWeight: 600, fontFamily: '"Inter", sans-serif', textDecoration: 'none' }}>
              API Documentation <ArrowRight size={16} style={{ marginLeft: '8px' }} />
            </a>
          </div>

          {/* Right Column Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            
            {/* Card 1 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#3b82f6', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.01
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>Edge Latency</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '24px', flexGrow: 1 }}>
                Global edge nodes ensure inspection adds less than 5ms overhead to your traffic.
              </p>
              <div>
                <div style={{ height: '4px', background: '#27272a', borderRadius: '2px', marginBottom: '10px', overflow: 'hidden' }}>
                  <div style={{ width: '85%', height: '100%', background: '#3b82f6', borderRadius: '2px' }} />
                </div>
                <div style={{ color: '#3b82f6', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', textTransform: 'uppercase' }}>
                  OPTIMIZED PERFORMANCE
                </div>
              </div>
            </FrostGlass>

            {/* Card 2 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#a1a1aa', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.02
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>gRPC Integration</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '24px', flexGrow: 1 }}>
                Native support for ultra-fast, bidirectional streaming telemetry across microservices.
              </p>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {['KUBERNETES', 'AWS', 'GCP'].map((pill, i) => (
                  <span key={i} style={{ 
                    border: '1px solid rgba(255, 255, 255, 0.2)', 
                    borderRadius: '16px', 
                    padding: '4px 10px', 
                    fontSize: '10px', 
                    color: '#e4e4e7', 
                    fontWeight: 500,
                    letterSpacing: '0.05em',
                    fontFamily: '"Inter", sans-serif'
                  }}>
                    {pill}
                  </span>
                ))}
              </div>
            </FrostGlass>

            {/* Card 3 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#ef4444', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.03
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>ML Precision</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '0' }}>
                Bayesian-based anomaly scoring with per-user baseline modeling.
              </p>
            </FrostGlass>

            {/* Card 4 */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column' }} padding="28px">
              <div style={{ color: '#a1a1aa', fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', fontFamily: '"Inter", sans-serif', marginBottom: '12px', textTransform: 'uppercase' }}>
                ENGINEERING.04
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>SOC2 / GDPR</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif', marginBottom: '0' }}>
                Fully compliant data residency and encryption at rest and in transit protocols.
              </p>
            </FrostGlass>

          </div>
        </FrostGlass>
        </motion.div>

      </main>
    </div>
  );
}
