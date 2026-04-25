import { motion } from "motion/react";
import { Radar, ShieldCheck, Terminal, GitBranch, ClipboardList } from "lucide-react";

export default function Capabilities() {
  return (
    <section className="bg-surface py-32 relative overflow-hidden">
      <div className="sentinel-gradient"></div>
      
      <div className="max-w-7xl mx-auto px-8">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">Core Capabilities</h2>
          <p className="text-on-surface-variant text-lg max-w-2xl">
            These are the capabilities the current repo actually demonstrates today, without pretending to be more mature than it is.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 h-auto md:h-[600px]">
          {/* Predictive Pulse */}
          <motion.div 
            whileHover={{ backgroundColor: "var(--color-surface-container-high)" }}
            className="md:col-span-3 glass-card ghost-border p-10 rounded-3xl flex flex-col justify-end transition-all"
          >
            <Radar className="text-secondary mb-8" size={48} />
            <h3 className="text-2xl font-bold text-white mb-3">Live Attack Storytelling</h3>
            <p className="text-on-surface-variant leading-relaxed">
              A WebSocket-driven war room that visualizes host risk, alerts, and battle progression as the red and blue agents act.
            </p>
          </motion.div>

          {/* Self-Healing Assets */}
          <motion.div 
            whileHover={{ backgroundColor: "var(--color-surface-container-high)" }}
            className="md:col-span-3 glass-card ghost-border p-10 rounded-3xl flex flex-col justify-between transition-all"
          >
            <div className="flex justify-between items-start">
              <ShieldCheck className="text-primary" size={48} />
              <div className="flex -space-x-2">
                <div className="w-10 h-10 rounded-full bg-secondary-container border-2 border-surface"></div>
                <div className="w-10 h-10 rounded-full bg-primary-container border-2 border-surface"></div>
              </div>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-white mb-3">Explainable Detection Layers</h3>
              <p className="text-on-surface-variant leading-relaxed">
                The detection stack exposes threat labels, confidence, MITRE mappings, and false-positive indicators instead of asking users to trust a black box.
              </p>
            </div>
          </motion.div>

          {/* Threat Pipeline */}
          <div className="md:col-span-2 bg-surface-container-low p-8 rounded-3xl flex flex-col hover:bg-surface-container-high transition-all">
            <Terminal className="text-tertiary mb-auto" size={32} />
            <h3 className="text-xl font-bold text-white mt-6">Threat Pipeline</h3>
            <p className="text-sm text-on-surface-variant mt-2">Intent vectors, shadow execution, attack-graph paths, and autonomy budget visualizations.</p>
          </div>

          {/* Attack Graph */}
          <div className="md:col-span-2 bg-surface-container-low p-8 rounded-3xl flex flex-col hover:bg-surface-container-high transition-all">
            <GitBranch className="text-primary mb-auto" size={32} />
            <h3 className="text-xl font-bold text-white mt-6">Attack Graph + Kill Chain</h3>
            <p className="text-sm text-on-surface-variant mt-2">Trace likely attacker movement, see breach countdown pressure, and surface crown-jewel exposure.</p>
          </div>

          {/* Playbooks */}
          <div className="md:col-span-2 bg-surface-container-low p-8 rounded-3xl flex flex-col hover:bg-surface-container-high transition-all border-l-4 border-secondary">
            <ClipboardList className="text-secondary mb-auto" size={32} />
            <h3 className="text-xl font-bold text-white mt-6">Operator Playbooks</h3>
            <p className="text-sm text-on-surface-variant mt-2">Generate response steps from active alerts so the product ends with an action plan, not just a warning.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
