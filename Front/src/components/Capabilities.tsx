import { motion } from "motion/react";
import { Radar, ShieldCheck, Terminal, Fingerprint, Zap } from "lucide-react";

export default function Capabilities() {
  return (
    <section className="bg-surface py-32 relative overflow-hidden">
      <div className="sentinel-gradient"></div>
      
      <div className="max-w-7xl mx-auto px-8">
        <div className="mb-16">
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">Core Capabilities</h2>
          <p className="text-on-surface-variant text-lg max-w-2xl">
            Precision engineered modules that work in concert to secure your entire digital footprint from edge to core.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-6 gap-6 h-auto md:h-[600px]">
          {/* Predictive Pulse */}
          <motion.div 
            whileHover={{ backgroundColor: "var(--color-surface-container-high)" }}
            className="md:col-span-3 glass-card ghost-border p-10 rounded-3xl flex flex-col justify-end transition-all"
          >
            <Radar className="text-secondary mb-8" size={48} />
            <h3 className="text-2xl font-bold text-white mb-3">Predictive Pulse</h3>
            <p className="text-on-surface-variant leading-relaxed">
              AI-driven forecasting that anticipates attack vectors before they manifest, analyzing historical patterns and global threat intelligence.
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
              <h3 className="text-2xl font-bold text-white mb-3">Self-Healing Assets</h3>
              <p className="text-on-surface-variant leading-relaxed">
                Automatically reconfigures network topology and instance state to isolate detected malware within seconds.
              </p>
            </div>
          </motion.div>

          {/* API Mesh Integrity */}
          <div className="md:col-span-2 bg-surface-container-low p-8 rounded-3xl flex flex-col hover:bg-surface-container-high transition-all">
            <Terminal className="text-tertiary mb-auto" size={32} />
            <h3 className="text-xl font-bold text-white mt-6">API Mesh Integrity</h3>
            <p className="text-sm text-on-surface-variant mt-2">Zero-trust validation for every microservice interaction.</p>
          </div>

          {/* Identity Guard */}
          <div className="md:col-span-2 bg-surface-container-low p-8 rounded-3xl flex flex-col hover:bg-surface-container-high transition-all">
            <Fingerprint className="text-primary mb-auto" size={32} />
            <h3 className="text-xl font-bold text-white mt-6">Identity Guard</h3>
            <p className="text-sm text-on-surface-variant mt-2">Behavioral biometric analysis to detect session hijacking.</p>
          </div>

          {/* Instant Remediation */}
          <div className="md:col-span-2 bg-surface-container-low p-8 rounded-3xl flex flex-col hover:bg-surface-container-high transition-all border-l-4 border-secondary">
            <Zap className="text-secondary mb-auto" size={32} />
            <h3 className="text-xl font-bold text-white mt-6">Instant Remediation</h3>
            <p className="text-sm text-on-surface-variant mt-2">One-click incident resolution for complex threats.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
