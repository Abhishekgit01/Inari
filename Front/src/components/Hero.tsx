import { motion } from "motion/react";
import { ArrowUpRight, Play } from "lucide-react";

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
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] mb-8 text-white">
            A live <span className="text-cyan-300">cyber defense</span><br />
            product you can actually explain
          </h1>
          
          <p className="text-xl text-slate-200/85 max-w-3xl mx-auto mb-12 leading-relaxed">
            Inari AI simulates red-vs-blue attacks, shows detections on a live network map,
            estimates breach pressure, and generates response playbooks. The next real product move is
            continuous ingestion through connectors, webhooks, streams, telemetry, SOAR, and SSO.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 mb-24 sm:flex-row">
            <button className="bg-black text-white px-10 py-4 rounded-full text-lg font-bold hover:bg-slate-800 transition-all transform hover:scale-105 inline-flex items-center gap-3">
              <Play size={18} />
              Open live demo
            </button>
            <a
              href="/features"
              className="bg-white/80 text-slate-900 px-10 py-4 rounded-full text-lg font-bold hover:bg-white transition-all transform hover:scale-105 inline-flex items-center gap-3 no-underline"
            >
              <ArrowUpRight size={18} />
              See Use Cases
            </a>
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
              title="Inari AI Demo"
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
