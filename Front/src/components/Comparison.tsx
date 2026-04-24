import { CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

export default function Comparison() {
  return (
    <section className="bg-surface py-32">
      <div className="max-w-7xl mx-auto px-8">
        <h2 className="text-4xl md:text-5xl font-bold text-white mb-20 text-center tracking-tight">Beyond Traditional Defenses</h2>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-outline-variant/30">
                <th className="py-8 px-6 font-bold text-xl text-white">Capability</th>
                <th className="py-8 px-6 font-bold text-xl text-primary">Inari</th>
                <th className="py-8 px-6 font-bold text-xl text-slate-500">Traditional SIEM</th>
                <th className="py-8 px-6 font-bold text-xl text-slate-500">Rule-Based Tools</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/20">
              <Row 
                label="Threat Detection Speed" 
                repello={<span className="text-secondary bg-secondary/10 px-4 py-1.5 rounded-full text-sm font-bold">&lt; 150ms</span>}
                siem="5-20 Minutes"
                rules="Variable/Latent"
              />
              <Row 
                label="False Positive Rate" 
                repello={<span className="text-secondary bg-secondary/10 px-4 py-1.5 rounded-full text-sm font-bold">0.001%</span>}
                siem="15-30%"
                rules="High (Noise)"
              />
              <Row 
                label="Autonomous Response" 
                repello={<CheckCircle2 className="text-secondary" size={28} />}
                siem="Manual Playbooks"
                rules="N/A"
              />
              <Row 
                label="Scalability" 
                repello="Elastic Multi-Cloud"
                siem="Hardware Limited"
                rules="Node-Based"
              />
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function Row({ label, repello, siem, rules }: { label: string; repello: ReactNode; siem: string; rules: string }) {
  return (
    <tr className="group hover:bg-white/5 transition-colors">
      <td className="py-10 px-6 font-semibold text-white text-lg">{label}</td>
      <td className="py-10 px-6 text-white font-medium">{repello}</td>
      <td className="py-10 px-6 text-on-surface-variant">{siem}</td>
      <td className="py-10 px-6 text-on-surface-variant">{rules}</td>
    </tr>
  );
}
