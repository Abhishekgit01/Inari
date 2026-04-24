import { motion } from 'motion/react';
import type { AptMatch } from '../../lib/ops-types';

export default function AptAttribution({ matches }: { matches: AptMatch[] }) {
  return (
    <div className="flex flex-col gap-2" style={{ maxHeight: 280, overflowY: 'auto' }}>
      <div className="text-xs tracking-widest mb-1" style={{ fontFamily: 'Orbitron', color: '#7a9cc4' }}>
        THREAT DNA — APT ATTRIBUTION
      </div>

      {matches.map((apt) => (
        <motion.div
          key={apt.name}
          className="flex flex-col gap-1 p-2 rounded-sm"
          style={{
            background: apt.is_top_match ? `${apt.color}11` : 'transparent',
            border: apt.is_top_match ? `1px solid ${apt.color}44` : '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium" style={{ fontFamily: 'IBM Plex Mono', color: apt.is_top_match ? apt.color : '#7a9cc4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {apt.flag} {apt.name}
            </span>
            <span className="text-xs" style={{ fontFamily: 'Share Tech Mono', color: apt.color }}>
              {apt.score_percent}%
            </span>
          </div>

          <div className="w-full h-1 rounded-sm" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <motion.div
              className="h-full rounded-sm"
              style={{ background: apt.color }}
              animate={{ width: `${apt.bar_fill * 100}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </div>

          {apt.is_top_match ? (
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'IBM Plex Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {apt.risk_note}
            </p>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}
