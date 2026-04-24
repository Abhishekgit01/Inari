import { Share2, Globe } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full py-20 px-8 border-t border-white/5 bg-surface-container-lowest">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-12">
        <div className="col-span-2 md:col-span-1">
          <span className="font-extrabold text-2xl text-white mb-6 block tracking-tighter">
            INARI
          </span>
          <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
            Securing the digital horizon with autonomic intelligence and unwavering vigilance.
          </p>
        </div>

        <FooterColumn 
          title="Platform" 
          links={["Threat Pulse", "Asset Inventory", "Network Map"]} 
        />
        <FooterColumn 
          title="Trust & Legal" 
          links={["Privacy Policy", "Terms of Service", "SOC2 Compliance", "GDPR"]} 
        />
        <FooterColumn 
          title="Connect" 
          links={["Contact", "Support", "Documentation"]} 
        />
      </div>

      <div className="max-w-7xl mx-auto mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
        <span className="text-sm text-on-surface-variant">
          © 2024 Inari. The Sentinel’s Horizon.
        </span>
        <div className="flex gap-8">
          <Share2 className="text-on-surface-variant hover:text-white cursor-pointer transition-colors" size={20} />
          <Globe className="text-on-surface-variant hover:text-white cursor-pointer transition-colors" size={20} />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h5 className="text-white font-bold mb-6 text-xs uppercase tracking-[0.2em]">{title}</h5>
      <ul className="flex flex-col gap-4">
        {links.map(link => (
          <li key={link}>
            <a href="#" className="text-sm text-on-surface-variant hover:text-secondary transition-colors">
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
