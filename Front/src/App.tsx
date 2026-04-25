import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import Capabilities from "./components/Capabilities";
import EnterpriseModes from "./components/EnterpriseModes";
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
      <EnterpriseModes />
      <LiveDemo />
      <Comparison />
      <TechnicalSpecs />
      <CTA />
      <Footer />
    </main>
  );
}
