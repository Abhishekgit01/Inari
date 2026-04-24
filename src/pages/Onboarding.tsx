import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SplineBackground } from '../components/SplineBackground';
import type { StoredAuth } from './Login';

interface OnboardingProps {
  auth: StoredAuth;
  onAuthChange: (auth: StoredAuth) => void;
  onComplete: (auth: StoredAuth) => void;
}

const cardStyle: CSSProperties = {
  width: 540,
  maxWidth: 'calc(100vw - 32px)',
  padding: '32px 28px 28px',
  borderRadius: 16,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'rgba(0, 229, 255, 0.4)',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(0,229,255,0.18) 100%)',
  backdropFilter: 'blur(54px)',
  pointerEvents: 'auto',
};

const featureVariants = {
  hidden: { opacity: 0, x: -18 },
  show: { opacity: 1, x: 0 },
};

const listVariants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.15,
    },
  },
};

const features = [
  'Real-time Red vs Blue agent simulation',
  '10-stage predictive threat pipeline',
  'Cross-layer threat detection (3 signals)',
  'MITRE ATT&CK mapped alerts + auto-playbooks',
  'Giskard-powered adversarial blind-spot scans',
];

export function Onboarding({ auth, onAuthChange, onComplete }: OnboardingProps) {
  const [alias, setAlias] = useState(auth.alias || auth.operatorId || '');
  const [step, setStep] = useState(auth.alias ? 2 : 1);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    if (!auth.alias && auth.operatorId && !alias) {
      setAlias(auth.operatorId);
    }
  }, [alias, auth.alias, auth.operatorId]);

  const welcomeAlias = useMemo(() => (auth.alias || alias || 'Operator').toUpperCase(), [alias, auth.alias]);

  const persistAuth = (nextAuth: StoredAuth) => {
    window.localStorage.setItem('cg_auth', JSON.stringify(nextAuth));
    onAuthChange(nextAuth);
  };

  const handleAliasConfirm = () => {
    const trimmedAlias = alias.trim();
    if (!trimmedAlias) {
      return;
    }

    persistAuth({
      ...auth,
      alias: trimmedAlias,
    });
    setStep(2);
  };

  const handleComplete = () => {
    if (launching) {
      return;
    }

    const completedAuth = {
      ...auth,
      alias: alias.trim() || auth.alias || auth.operatorId || 'Operator',
      onboarded: true,
    } satisfies StoredAuth;

    persistAuth(completedAuth);
    setLaunching(true);
    window.setTimeout(() => onComplete(completedAuth), 300);
  };

  return (
    <>
      <SplineBackground
        scene="https://prod.spline.design/jLzBfmhFeHun-l9A/scene.splinecode"
        overlay="linear-gradient(135deg, rgba(3,5,15,0.15) 0%, rgba(6,11,20,0.1) 100%)"
      />
      <div
        style={{
          position: 'relative',
          zIndex: 10,
          display: 'flex',
          minHeight: '100vh',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '24px 48px 24px 24px',
          pointerEvents: 'none',
        }}
      >
        <AnimatePresence mode="wait">
          {step === 1 ? (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              initial={{ opacity: 0, x: 40 }}
              key="alias-step"
              style={cardStyle}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div
                style={{
                  color: '#ffffff',
                  fontFamily: '"Orbitron", monospace',
                  fontSize: 22,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Initializing Operator Profile
              </div>
              <div
                style={{
                  width: 260,
                  maxWidth: '100%',
                  marginTop: 10,
                  borderTop: '1px solid rgba(0, 229, 255, 0.18)',
                }}
              />

              <div
                style={{
                  marginTop: 24,
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.8,
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Before we begin — what should I call you?
              </div>

              <input
                onChange={(event) => setAlias(event.target.value)}
                placeholder="OPERATOR ALIAS"
                style={{
                  width: '100%',
                  height: 50,
                  marginTop: 22,
                  padding: '0 16px',
                  borderRadius: 4,
                  border: '1px solid rgba(0, 229, 255, 0.3)',
                  background: 'rgba(10, 15, 20, 0.7)',
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 14,
                  outline: 'none',
                }}
                type="text"
                value={alias}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 22,
                }}
              >
                <motion.button
                  onClick={handleAliasConfirm}
                  style={{
                    height: 44,
                    padding: '0 18px',
                    borderRadius: 4,
                    border: '1px solid #00e5ff',
                    background: 'transparent',
                    color: '#00e5ff',
                    cursor: 'pointer',
                    fontFamily: '"Orbitron", monospace',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                  }}
                  type="button"
                  whileHover={{
                    backgroundColor: 'rgba(0, 229, 255, 0.1)',
                    boxShadow: '0 0 20px rgba(0, 229, 255, 0.3)',
                  }}
                  whileTap={{ scale: 0.97 }}
                >
                  Confirm -&gt;
                </motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              initial={{ opacity: 0, x: 40 }}
              key="briefing-step"
              style={cardStyle}
              transition={{ duration: 0.45, ease: 'easeOut' }}
            >
              <div
                style={{
                  color: '#ffffff',
                  fontFamily: '"Orbitron", monospace',
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Welcome, {welcomeAlias}
              </div>
              <div
                style={{
                  width: 260,
                  maxWidth: '100%',
                  marginTop: 10,
                  borderTop: '1px solid rgba(0, 229, 255, 0.18)',
                }}
              />

              <div
                style={{
                  marginTop: 22,
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 15,
                  fontWeight: 600,
                  lineHeight: 1.8,
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Inari gives you:
              </div>

              <motion.div
                animate="show"
                initial="hidden"
                style={{ marginTop: 18, display: 'grid', gap: 12 }}
                variants={listVariants}
              >
                {features.map((feature) => (
                  <motion.div
                    key={feature}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      color: '#ffffff',
                      fontFamily: '"IBM Plex Mono", monospace',
                      fontSize: 14,
                      fontWeight: 600,
                      textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                    }}
                    variants={featureVariants}
                  >
                    <span style={{ color: '#00e5ff', fontSize: 18 }}>⬡</span>
                    <span>{feature}</span>
                  </motion.div>
                ))}
              </motion.div>

              <div
                style={{
                  marginTop: 24,
                  color: '#ffffff',
                  fontFamily: '"IBM Plex Mono", monospace',
                  fontSize: 14,
                  fontWeight: 600,
                  fontStyle: 'italic',
                  textShadow: '0 2px 8px rgba(0,0,0,0.85)',
                }}
              >
                Your mission: Keep the network alive.
              </div>

              <motion.button
                animate={
                  launching
                    ? {
                        backgroundColor: ['rgba(0, 229, 255, 0.06)', 'rgba(0, 229, 255, 0.95)', 'rgba(0, 229, 255, 0.28)'],
                        color: ['#00e5ff', '#031322', '#031322'],
                      }
                    : undefined
                }
                onClick={handleComplete}
                style={{
                  width: '100%',
                  height: 48,
                  marginTop: 28,
                  borderRadius: 4,
                  border: '1px solid #00e5ff',
                  background: 'transparent',
                  color: '#00e5ff',
                  cursor: launching ? 'wait' : 'pointer',
                  fontFamily: '"Orbitron", monospace',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  textShadow: '0 2px 6px rgba(0,0,0,0.85)',
                }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                type="button"
                whileHover={
                  launching
                    ? undefined
                    : {
                        backgroundColor: 'rgba(0, 229, 255, 0.1)',
                        boxShadow: '0 0 20px rgba(0, 229, 255, 0.3)',
                      }
                }
                whileTap={launching ? undefined : { scale: 0.97 }}
              >
                {launching ? 'Launching War Room...' : 'Enter the War Room ------------> '}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
