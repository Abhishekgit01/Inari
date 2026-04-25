import { motion } from "motion/react";

export default function Navbar() {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4">
      <motion.nav 
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="repello-nav-glass rounded-full px-8 py-3 flex items-center justify-between"
      >
        <a href="/" className="flex items-center gap-2 no-underline">
          <div className="text-xl font-extrabold tracking-tighter text-slate-900">
            INARI
          </div>
        </a>

        <div className="hidden md:flex items-center gap-8">
          <NavLink label="Use Cases" href="/features" />
          <NavLink label="Technology" href="/technology" />
          <NavLink label="Blogs" href="/blogs" />
          <NavLink label="About Us" href="/about" />
        </div>

        <a href="/login" className="bg-slate-900 text-white px-6 py-2 rounded-full text-sm font-semibold hover:bg-slate-800 transition-colors no-underline">
          Open Console
        </a>
      </motion.nav>
    </div>
  );
}

function NavLink({ label, href }: { label: string; href: string }) {
  return (
    <a href={href} className="flex items-center gap-1 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors no-underline">
      {label}
    </a>
  );
}
