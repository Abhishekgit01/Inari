import { motion } from "motion/react";

export default function CTA() {
  return (
    <section className="bg-surface py-32 px-8">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="max-w-5xl mx-auto text-center py-24 relative overflow-hidden rounded-[4rem] glass-card ghost-border"
      >
        <div className="absolute inset-0 bg-primary/5 -z-10"></div>
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-secondary/10 rounded-full blur-[100px]"></div>
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-primary/10 rounded-full blur-[100px]"></div>
        
        <h2 className="text-5xl md:text-6xl font-bold text-white mb-8 tracking-tight">Deploy the Sentinel.</h2>
        <p className="text-on-surface-variant text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
          Join the 400+ enterprises who have reduced their incident response time by 94% using Inari.
        </p>
        
        <div className="flex flex-col sm:flex-row justify-center gap-6">
          <button className="bg-primary px-12 py-5 rounded-2xl text-on-primary font-bold text-xl hover:shadow-[0_0_40px_rgba(176,198,255,0.4)] transition-all transform hover:scale-105">
            Start Free Pilot
          </button>
          <button className="px-12 py-5 rounded-2xl border border-outline text-white font-bold text-xl hover:bg-white/5 transition-all transform hover:scale-105">
            Talk to a Specialist
          </button>
        </div>
      </motion.div>
    </section>
  );
}
