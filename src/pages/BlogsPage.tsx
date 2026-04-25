import { motion } from 'framer-motion';
import { Clock, User, ArrowRight } from 'lucide-react';
import { SiteNavbar } from '../components/SiteNavbar';
import { FrostGlass } from '../components/FrostGlass';
const posts = [
  {
    title: 'The Enterprise Attack Surface Field Report',
    excerpt: 'A practical long-form report on where attackers usually enter, how they move across the estate, and which prevention habits actually interrupt the path.',
    author: 'Athernex Research',
    date: 'Apr 2026',
    tag: 'Field Report',
    tagColor: '#00e5ff',
    href: '/threat-report',
    cta: 'Open report',
  },
  {
    title: 'Kill Chain Velocity: Predicting Breach Windows in Real-Time',
    excerpt: 'By tracking velocity and acceleration through the 7-stage kill chain, we can forecast breach timelines with 87% confidence — giving defenders precious minutes to respond.',
    author: 'Threat Intelligence Team',
    date: 'Mar 2026',
    tag: 'Threat Intel',
    tagColor: '#ff6600',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Shadow Branch Execution: Pre-Computing Attack Paths Before They Happen',
    excerpt: 'The neural pipeline evaluates alternate red-team trajectories in parallel, assigning risk scores to paths that haven\'t been taken yet — enabling truly proactive defense.',
    author: 'ML Engineering',
    date: 'Mar 2026',
    tag: 'Engineering',
    tagColor: '#00ff88',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Why Decision Transparency Matters in Autonomous Security',
    excerpt: 'Black-box AI defenders are dangerous. We expose full Q-value distributions and policy probabilities so operators understand exactly why each action was chosen.',
    author: 'Product Team',
    date: 'Feb 2026',
    tag: 'Product',
    tagColor: '#ffcc00',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Cross-Layer Correlation: Fusing Network, Endpoint, and Application Signals',
    excerpt: 'Single-layer detection misses 68% of sophisticated attacks. Our correlator fuses three signal layers to surface high-fidelity alerts with MITRE ATT&CK mapping.',
    author: 'Detection Engineering',
    date: 'Feb 2026',
    tag: 'Detection',
    tagColor: '#ff0044',
    href: '#',
    cta: 'Read more',
  },
  {
    title: 'Building the Autonomy Budget: Preventing Runaway AI Defenders',
    excerpt: 'An autonomous agent without spending limits is a liability. Our replenishing budget system throttles defense spending and triggers human oversight when reserves deplete.',
    author: 'Safety Team',
    date: 'Jan 2026',
    tag: 'AI Safety',
    tagColor: '#00e5ff',
    href: '#',
    cta: 'Read more',
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

        <motion.a
          href="/threat-report"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          style={{ display: 'block', textDecoration: 'none', marginBottom: '28px' }}
        >
          <FrostGlass padding="28px" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '20px', alignItems: 'center' }}>
            <div style={{ maxWidth: '760px' }}>
              <div style={{ fontSize: '11px', fontFamily: '"Inter", monospace', fontWeight: 600, letterSpacing: '0.08em', color: '#00e5ff', textTransform: 'uppercase', marginBottom: '10px' }}>
                Featured report
              </div>
              <h2 style={{ margin: '0 0 10px', fontSize: '28px', color: '#fff', fontFamily: '"Inter", sans-serif' }}>
                The Enterprise Attack Surface Field Report
              </h2>
              <p style={{ margin: 0, color: '#94a3b8', fontSize: '15px', lineHeight: 1.7 }}>
                A downloadable long-form report covering where attacks usually land, how attackers move, and what defenders can do to break the path early.
              </p>
            </div>
            <span style={{ color: '#00e5ff', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 500 }}>
              Open report <ArrowRight size={16} />
            </span>
          </FrostGlass>
        </motion.a>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {posts.map((post, i) => (
            <motion.a
              key={post.title}
              href={post.href}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                textDecoration: 'none',
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
                  {post.cta} <ArrowRight size={14} />
                </span>
              </div>
              </FrostGlass>
            </motion.a>
          ))}
        </div>
      </main>
    </div>
  );
}
