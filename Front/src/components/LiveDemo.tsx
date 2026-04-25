export default function LiveDemo() {
  return (
    <section className="bg-surface-container-lowest py-32">
      <div className="max-w-7xl mx-auto px-8 text-center mb-16">
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-white mb-4">See the war room in motion</h2>
        <p className="text-on-surface-variant text-lg max-w-xl mx-auto">
          This demo shows the live command view: network activity, attack pressure, pipeline state, and operator-facing response guidance.
        </p>
      </div>

      <div className="max-w-5xl mx-auto px-8">
        <div className="relative glass-card p-6 rounded-[2.5rem] ghost-border overflow-hidden">
          <div className="rounded-2xl overflow-hidden aspect-video bg-black flex items-center justify-center relative group">
            <iframe 
              src="https://demo.arcade.software/YnEbfYXKqKwSAh22wF7a?embed&show_copy_link=true" 
              title="Inari Demo" 
              frameBorder="0" 
              loading="lazy" 
              allowFullScreen 
              allow="clipboard-write"
              className="absolute top-0 left-0 w-full h-full"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
