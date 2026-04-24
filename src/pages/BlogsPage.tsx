import { motion } from 'framer-motion';
import { Clock, User, ArrowRight } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
const posts = [
  {
    title: 'How PPO-Trained Blue Agents Outperform Static SOAR Rules',
    excerpt: 'Our deep RL defender achieves 3.2× faster mean time to respond by learning adaptive isolation and patching strategies that no rulebook can anticipate.',
    author: 'Inari Research',
    date: 'Apr 2026',
    tag: 'Research',
    tagColor: '#00e5ff',
  },
  {
    title: 'Kill Chain Velocity: Predicting Breach Windows in Real-Time',
    excerpt: 'By tracking velocity and acceleration through the 7-stage kill chain, we can forecast breach timelines with 87% confidence — giving defenders precious minutes to respond.',
    author: 'Threat Intelligence Team',
    date: 'Mar 2026',
    tag: 'Threat Intel',
    tagColor: '#ff6600',
  },
  {
    title: 'Shadow Branch Execution: Pre-Computing Attack Paths Before They Happen',
    excerpt: 'The neural pipeline evaluates alternate red-team trajectories in parallel, assigning risk scores to paths that haven\'t been taken yet — enabling truly proactive defense.',
    author: 'ML Engineering',
    date: 'Mar 2026',
    tag: 'Engineering',
    tagColor: '#00ff88',
  },
  {
    title: 'Why Decision Transparency Matters in Autonomous Security',
    excerpt: 'Black-box AI defenders are dangerous. We expose full Q-value distributions and policy probabilities so operators understand exactly why each action was chosen.',
    author: 'Product Team',
    date: 'Feb 2026',
    tag: 'Product',
    tagColor: '#ffcc00',
  },
  {
    title: 'Cross-Layer Correlation: Fusing Network, Endpoint, and Application Signals',
    excerpt: 'Single-layer detection misses 68% of sophisticated attacks. Our correlator fuses three signal layers to surface high-fidelity alerts with MITRE ATT&CK mapping.',
    author: 'Detection Engineering',
    date: 'Feb 2026',
    tag: 'Detection',
    tagColor: '#ff0044',
  },
  {
    title: 'Building the Autonomy Budget: Preventing Runaway AI Defenders',
    excerpt: 'An autonomous agent without spending limits is a liability. Our replenishing budget system throttles defense spending and triggers human oversight when reserves deplete.',
    author: 'Safety Team',
    date: 'Jan 2026',
    tag: 'AI Safety',
    tagColor: '#00e5ff',
  },
];

export function BlogsPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#080c14', color: '#e1e2e7', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)', width: '80vw', height: '60vh', background: 'radial-gradient(ellipse at center, rgba(0, 229, 255, 0.08) 0%, rgba(8, 14, 28, 0) 70%)', filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0 }} />
      <SiteNavbar />

      <main style={{ position: 'relative', zIndex: 10, paddingTop: '160px', paddingBottom: '80px', maxWidth: 1100, margin: '0 auto', paddingInline: '24px' }}>
        
        <div style={{ textAlign: 'center', marginBottom: '64px' }}>
          <h1 style={{ fontSize: '42px', fontWeight: 600, fontFamily: '"Inter", sans-serif', color: '#fff', marginBottom: '16px' }}>
            Latest Insights
          </h1>
          <p style={{ color: '#94a3b8', fontSize: '18px', maxWidth: '700px', margin: '0 auto', lineHeight: 1.6 }}>
            Research, engineering deep-dives, and threat intelligence from the team building real-time AI-powered cybersecurity.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {posts.map((post, i) => (
            <motion.article
              key={post.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <FrostGlass style={{ display: 'flex', flexDirection: 'column', height: '100%' }} padding="32px">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <span style={{
                  fontSize: '11px', fontFamily: '"Inter", monospace', fontWeight: 600, letterSpacing: '0.05em',
                  color: post.tagColor, background: `${post.tagColor}15`, border: `1px solid ${post.tagColor}30`,
                  borderRadius: '6px', padding: '4px 10px', textTransform: 'uppercase',
                }}>
                  {post.tag}
                </span>
                <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} /> {post.date}
                </span>
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', margin: '0 0 12px', lineHeight: 1.4, fontFamily: '"Inter", sans-serif' }}>
                {post.title}
              </h3>
              <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, margin: '0 0 24px', flex: 1 }}>{post.excerpt}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '16px' }}>
                <span style={{ fontSize: '13px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} /> {post.author}
                </span>
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#00e5ff', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  Read more <ArrowRight size={14} />
                </span>
              </div>
              </FrostGlass>
            </motion.article>
          ))}
        </div>
      </main>
    </div>
  );
}
