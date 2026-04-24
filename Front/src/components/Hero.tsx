import { motion } from "motion/react";
import { Play } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative pt-80 pb-20 overflow-hidden bg-transparent">
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 z-0 opacity-[0.03]" 
           style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
      </div>

      <div className="max-w-7xl mx-auto px-8 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mt-24"
        >
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-8 text-slate-900">
            Enterprise-grade <span className="text-blue-600">runtime</span><br />
            <span className="text-blue-600">security</span> for genAI applications
          </h1>
          
          <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-12 leading-relaxed">
            Real-time guardrails for LLMs and AI agents. Monitor usage, detect abuse, and mitigate threats live.
          </p>

          <div className="flex justify-center mb-24">
            <button className="bg-black text-white px-10 py-4 rounded-full text-lg font-bold hover:bg-slate-800 transition-all transform hover:scale-105">
              Get a demo
            </button>
          </div>
        </motion.div>

        {/* Dashboard Preview */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="relative max-w-5xl mx-auto"
        >
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-slate-200 bg-slate-900 aspect-video relative group">
            <video 
              controls 
              className="w-full h-full object-cover"
              title="Inari Dashboard Demo"
            >
              <source src="/demo.mp4" type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
