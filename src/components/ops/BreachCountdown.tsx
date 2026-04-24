import { motion } from 'motion/react';

interface BreachCountdownProps {
  countdownDisplay: string;
  countdownSeconds: number | null;
  confidence: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  urgencyColor: string;
  currentStage: number;
  currentStageName: string;
  killChainProgress: number;
}

export default function BreachCountdown({
  countdownDisplay,
  countdownSeconds,
  confidence,
  urgency,
  urgencyColor,
  currentStage,
  currentStageName,
  killChainProgress,
}: BreachCountdownProps) {
  const isBreachImminent = urgency === 'critical';

  return (
    <div className="relative flex flex-col items-center">
      <motion.div
        className="relative flex flex-col items-center p-6 rounded-sm"
        style={{
          background: 'rgba(13, 22, 40, 0.9)',
          border: `1px solid ${urgencyColor}`,
          boxShadow: isBreachImminent
            ? `0 0 40px ${urgencyColor}66, 0 0 80px ${urgencyColor}33`
            : `0 0 16px ${urgencyColor}33`,
        }}
        animate={isBreachImminent ? {
          boxShadow: [
            `0 0 20px ${urgencyColor}66`,
            `0 0 60px ${urgencyColor}88, 0 0 100px ${urgencyColor}44`,
            `0 0 20px ${urgencyColor}66`,
          ],
        } : {}}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <div className="text-xs tracking-widest mb-3" style={{ color: urgencyColor, fontFamily: 'Orbitron' }}>
          {countdownSeconds === null
            ? '● MONITORING'
            : isBreachImminent
            ? '⚠ BREACH IMMINENT'
            : '⚠ ESTIMATED BREACH IN'}
        </div>

        <div
          className="text-5xl font-bold tracking-wider tabular-nums"
          style={{
            fontFamily: 'Share Tech Mono',
            color: urgencyColor,
            textShadow: `0 0 20px ${urgencyColor}`,
          }}
        >
          {countdownDisplay}
        </div>

        <div className="mt-3 text-xs" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'IBM Plex Mono' }}>
          {(confidence * 100).toFixed(0)}% confidence • RL-derived
        </div>

        <div className="mt-4 w-full">
          <div className="flex justify-between text-xs mb-1" style={{ fontFamily: 'IBM Plex Mono', color: 'rgba(255,255,255,0.4)' }}>
            <span>RECON</span>
            <span>{currentStageName.toUpperCase()}</span>
            <span>EXFIL</span>
          </div>
          <div className="w-full h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <motion.div
              className="h-full rounded-sm"
              style={{ background: urgencyColor }}
              animate={{ width: `${killChainProgress * 100}%` }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </div>
          <div className="flex justify-between mt-1">
            {[1,2,3,4,5,6,7].map(s => (
              <div
                key={s}
                className="w-2 h-2 rounded-full"
                style={{
                  background: s <= currentStage ? urgencyColor : 'rgba(255,255,255,0.15)',
                  boxShadow: s === currentStage ? `0 0 8px ${urgencyColor}` : 'none',
                }}
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
