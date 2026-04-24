import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Capabilities from "./components/Capabilities";
import LiveDemo from "./components/LiveDemo";
import Comparison from "./components/Comparison";
import TechnicalSpecs from "./components/TechnicalSpecs";
import CTA from "./components/CTA";
import Footer from "./components/Footer";

export default function App() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Capabilities />
      <LiveDemo />
      <Comparison />
      <TechnicalSpecs />
      <CTA />
      <Footer />
    </main>
  );
}
