import { motion } from 'framer-motion';
import { Target, Shield, Terminal, Fingerprint, Zap, CheckCircle2 } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
export function FeaturesPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#111216', color: '#fff', paddingBottom: '120px' }}>
      <SiteNavbar />
      
      <main style={{ paddingTop: '160px', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '80px', paddingInline: '24px' }}>
        
        {/* Card 1: Beyond Traditional Defenses */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        >
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }} padding="48px 48px 32px 48px">
          <h2 style={{ fontSize: '32px', fontWeight: 600, fontFamily: '"Inter", sans-serif', color: '#fff', textAlign: 'center', marginBottom: '32px' }}>
            Beyond Traditional Defenses
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Rows */}
            {[
              {
                label: 'Threat Detection Speed',
                val1: '< 150ms', color1: '#00e5ff',
                val2: '5-20 Minutes', color2: '#a1a1aa',
                val3: 'Variable/Latent', color3: '#71717a'
              },
              {
                label: 'False Positive Rate',
                val1: '0.001%', color1: '#3b82f6',
                val2: '15-30%', color2: '#a1a1aa',
                val3: 'High (Noise)', color3: '#71717a'
              },
              {
                label: 'Autonomous Response',
                val1: 'icon', color1: '#00e5ff',
                val2: 'Manual Playbooks', color2: '#a1a1aa',
                val3: 'N/A', color3: '#71717a'
              },
              {
                label: 'Scalability',
                val1: 'Elastic Multi-Cloud', color1: '#e2e8f0',
                val2: 'Hardware Limited', color2: '#a1a1aa',
                val3: 'Node-Based', color3: '#71717a',
                noBorder: true
              }
            ].map((row, idx) => (
              <div key={idx} style={{ 
                display: 'grid', 
                gridTemplateColumns: 'minmax(220px, 1.5fr) 1fr 1fr 1fr', 
                alignItems: 'center', 
                padding: '24px 0', 
                borderBottom: row.noBorder ? 'none' : '1px solid rgba(255,255,255,0.1)' 
              }}>
                <div style={{ fontWeight: 600, color: '#f4f4f5', fontSize: '15px', fontFamily: '"Inter", sans-serif' }}>{row.label}</div>
                <div style={{ color: row.color1, fontSize: '14px', fontWeight: 600, fontFamily: '"Inter", sans-serif' }}>
                  {row.val1 === 'icon' ? <CheckCircle2 size={18} color="#3b82f6" fill="transparent" /> : row.val1}
                </div>
                <div style={{ color: row.color2, fontSize: '14px', fontWeight: 400, fontFamily: '"Inter", sans-serif' }}>{row.val2}</div>
                <div style={{ color: row.color3, fontSize: '14px', fontWeight: 400, fontFamily: '"Inter", sans-serif' }}>{row.val3}</div>
              </div>
            ))}
          </div>
          </FrostGlass>
        </motion.div>

        {/* Card 2: Core Capabilities */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.1 }}
        >
          <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }} padding="48px">
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <h2 style={{ fontSize: '36px', fontWeight: 600, fontFamily: '"Inter", sans-serif', color: '#fff', marginBottom: '16px' }}>
              Core Capabilities
            </h2>
            <p style={{ color: '#a1a1aa', fontSize: '15px', maxWidth: '580px', margin: '0 auto', lineHeight: 1.6, fontFamily: '"Inter", sans-serif' }}>
              Precision engineered modules that stay readable in the center lane while the sequence keeps full visual control of the page.
            </p>
          </div>

          {/* Top Row: 2 items */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
            {/* Predictive Pulse */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} padding="32px">
              <Target size={26} color="#3b82f6" style={{ marginBottom: '24px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>Predictive Pulse</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                AI-driven forecasting that anticipates attack vectors before they manifest, analyzing historical patterns and global threat intelligence.
              </p>
            </FrostGlass>
            {/* Self-Healing Assets */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} padding="32px">
              <Shield size={26} color="#e2e8f0" style={{ marginBottom: '24px' }} />
              <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#fff', marginBottom: '16px', fontFamily: '"Inter", sans-serif' }}>Self-Healing Assets</h3>
              <p style={{ fontSize: '14px', color: '#a1a1aa', lineHeight: 1.7, fontFamily: '"Inter", sans-serif' }}>
                Automatically reconfigures network topology and instance state to isolate detected malware within seconds.
              </p>
            </FrostGlass>
          </div>

          {/* Bottom Row: 3 items */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            {/* API Mesh Integrity */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} padding="32px 24px">
              <Terminal size={22} color="#f4f4f5" style={{ marginBottom: '20px' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#fff', marginBottom: '12px', fontFamily: '"Inter", sans-serif' }}>API Mesh Integrity</h3>
            </FrostGlass>
            {/* Identity Guard */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} padding="32px 24px">
              <Fingerprint size={22} color="#ef4444" style={{ marginBottom: '20px' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#fff', marginBottom: '12px', fontFamily: '"Inter", sans-serif' }}>Identity Guard</h3>
            </FrostGlass>
            {/* Instant Remediation */}
            <FrostGlass style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }} padding="32px 24px">
              <Zap size={22} color="#3b82f6" style={{ marginBottom: '20px' }} />
              <h3 style={{ fontSize: '17px', fontWeight: 600, color: '#fff', marginBottom: '12px', fontFamily: '"Inter", sans-serif' }}>Instant Remediation</h3>
            </FrostGlass>
          </div>
          </FrostGlass>
        </motion.div>

      </main>
    </div>
  );
}
