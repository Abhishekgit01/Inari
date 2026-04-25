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
            A simulation-first cyber defense product for live demos, analyst training, and explainable workflow prototyping.
          </p>
        </div>

        <FooterColumn
          title="Platform"
          links={[
            { label: "Live Demo", href: "/" },
            { label: "Use Cases", href: "/features" },
            { label: "Technology", href: "/technology" },
          ]}
        />
        <FooterColumn
          title="Reality Check"
          links={[
            { label: "Features", href: "/features" },
            { label: "Company Pilots", href: "/features" },
            { label: "Training View", href: "/login" },
          ]}
        />
        <FooterColumn
          title="Connect"
          links={[
            { label: "Open Console", href: "/login" },
            { label: "Blogs", href: "/blogs" },
            { label: "About", href: "/about" },
          ]}
        />
      </div>

      <div className="max-w-7xl mx-auto mt-20 pt-10 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
        <span className="text-sm text-on-surface-variant">
          © 2026 Inari AI.
        </span>
        <div className="flex gap-8">
          <Share2 className="text-on-surface-variant hover:text-white cursor-pointer transition-colors" size={20} />
          <Globe className="text-on-surface-variant hover:text-white cursor-pointer transition-colors" size={20} />
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: Array<{ label: string; href: string }> }) {
  return (
    <div>
      <h5 className="text-white font-bold mb-6 text-xs uppercase tracking-[0.2em]">{title}</h5>
      <ul className="flex flex-col gap-4">
        {links.map(link => (
          <li key={link.label}>
            <a href={link.href} className="text-sm text-on-surface-variant hover:text-secondary transition-colors">
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
