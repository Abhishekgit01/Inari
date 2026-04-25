import { useState } from 'react';
import { Check, Zap, Shield, ShieldAlert } from 'lucide-react';
import { MagicBentoGrid, BentoCard } from '../components/ui/MagicBento';
import { type StoredAuth } from './Login';

interface PricingPageProps {
  auth: StoredAuth;
  onProceed: () => void;
}

export function PricingPage({ onProceed }: PricingPageProps) {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [planType, setPlanType] = useState<'individual' | 'team'>('individual');

  return (
    <div className="flex flex-col min-h-screen items-center justify-center py-20 px-4" style={{ 
      background: 'linear-gradient(180deg, #03050f 0%, #0c0e12 100%)',
      position: 'relative',
      zIndex: 1
    }}>
      {/* Background Grid */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(0, 229, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 229, 255, 0.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      
      <div className="relative z-10 w-full max-w-5xl mx-auto flex flex-col items-center">
        
        <h1 className="text-4xl md:text-5xl font-light text-white mb-8 text-center" style={{ fontFamily: '"Orbitron", monospace' }}>
          Plans that grow with you
        </h1>

        {/* Global Plan Type Toggle (Individual / Team) */}
        <div className="flex items-center gap-1 p-1 rounded-full border border-white/10 bg-white/5 backdrop-blur-md mb-12">
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${planType === 'individual' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}
            onClick={() => setPlanType('individual')}
          >
            Individual
          </button>
          <button 
            className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${planType === 'team' ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'}`}
            onClick={() => setPlanType('team')}
          >
            Team and Enterprise
          </button>
        </div>

        {/* Pricing Cards */}
        <MagicBentoGrid className="grid-cols-1 md:grid-cols-3 gap-6 w-full">
          
          {/* Free Plan */}
          <BentoCard className="flex flex-col">
            <div className="mb-6 flex justify-between items-start">
              <div>
                <div className="w-10 h-10 mb-4 rounded-full flex items-center justify-center border border-white/10 bg-white/5 text-cyan-400">
                  <Shield size={20} />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-1">Free</h3>
                <p className="text-sm text-white/50">Meet Athernex</p>
              </div>
            </div>

            <div className="mb-8">
              <div className="text-4xl font-light text-white mb-2" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>$0</div>
            </div>

            <button 
              className="w-full py-3 px-4 rounded-xl text-sm font-medium text-white/90 border border-white/10 bg-white/5 hover:bg-white/10 transition-colors mb-4"
              onClick={onProceed}
            >
              Use Athernex for free
            </button>

            <div className="border-t border-white/10 pt-6 mt-2 flex-1">
              <ul className="space-y-4">
                {[
                  'Chat on web, iOS, Android, and desktop',
                  'Basic log ingestion and analysis',
                  'Standard Threat Intelligence Feed',
                  'Single node simulation endpoint',
                  'Community playbooks'
                ].map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm text-white/70">
                    <Check size={16} className="text-cyan-400 shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

          {/* Pro Plan */}
          <BentoCard className="flex flex-col relative" style={{ borderColor: 'rgba(0, 229, 255, 0.4)' }}>
            <div className="absolute inset-0 bg-cyan-400/5 rounded-[20px] pointer-events-none" />
            
            <div className="mb-6 flex justify-between items-start">
              <div>
                <div className="w-10 h-10 mb-4 rounded-full flex items-center justify-center border border-cyan-400/30 bg-cyan-400/10 text-cyan-400">
                  <Zap size={20} />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-1">Pro</h3>
                <p className="text-sm text-white/50">Research, hunt, and respond</p>
              </div>
              
              {/* Billing Toggle (Monthly / Yearly) */}
              <div className="flex bg-white/5 rounded-full p-0.5 border border-white/10 text-[10px]">
                <button 
                  className={`px-3 py-1 rounded-full transition-colors ${billingCycle === 'monthly' ? 'bg-white/10 text-white' : 'text-white/50'}`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Monthly
                </button>
                <button 
                  className={`px-3 py-1 rounded-full transition-colors flex items-center gap-1 ${billingCycle === 'yearly' ? 'bg-white/10 text-white' : 'text-white/50'}`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Yearly <span className="text-cyan-400">Save 17%</span>
                </button>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-light text-white" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  ${billingCycle === 'monthly' ? '20' : '16'}
                </span>
                <span className="text-xs text-white/40 flex flex-col">
                  <span>USD / month</span>
                  <span>billed {billingCycle}</span>
                </span>
              </div>
            </div>

            <button 
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors"
              onClick={onProceed}
            >
              Get Pro plan
            </button>
            <p className="text-[10px] text-center text-white/40 mt-3 mb-4">No commitment · Cancel anytime</p>

            <div className="border-t border-white/10 pt-6 mt-2 flex-1 relative z-10">
              <p className="text-xs text-white/90 font-medium mb-4">Everything in Free and:</p>
              <ul className="space-y-4">
                {[
                  'Advanced AI Agent directly in your SOC',
                  'HyperAgent Meta-Engine access',
                  'Higher simulation execution limits',
                  'Deep Kill Chain Oracle predictive models',
                  'Multi-tenant persistence across sessions'
                ].map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm text-white/80">
                    <Check size={16} className="text-white shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

          {/* Max Plan */}
          <BentoCard className="flex flex-col">
            <div className="mb-6 flex justify-between items-start">
              <div>
                <div className="w-10 h-10 mb-4 rounded-full flex items-center justify-center border border-white/10 bg-white/5 text-purple-400">
                  <ShieldAlert size={20} />
                </div>
                <h3 className="text-2xl font-semibold text-white mb-1">Max</h3>
                <p className="text-sm text-white/50">Higher limits, priority access</p>
              </div>
            </div>

            <div className="mb-8">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-4xl font-light text-white" style={{ fontFamily: '"IBM Plex Mono", monospace' }}>
                  From $100
                </span>
                <span className="text-xs text-white/40 flex flex-col">
                  <span>USD / month</span>
                  <span>billed {billingCycle}</span>
                </span>
              </div>
            </div>

            <button 
              className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-black bg-white hover:bg-white/90 transition-colors"
              onClick={onProceed}
            >
              Get Max plan
            </button>
            <p className="text-[10px] text-center text-white/40 mt-3 mb-4">No commitment · Cancel anytime</p>

            <div className="border-t border-white/10 pt-6 mt-2 flex-1">
              <p className="text-xs text-white/90 font-medium mb-4">Everything in Pro, plus:</p>
              <ul className="space-y-4">
                {[
                  'Up to 20x more RL simulation usage',
                  'Recommended for full Red vs Blue exercises',
                  'Early access to advanced Athernex features',
                  'Higher output limits for narrative reporting',
                  'Priority access at high threat times'
                ].map((feature, i) => (
                  <li key={i} className="flex gap-3 text-sm text-white/70">
                    <Check size={16} className="text-white shrink-0 mt-0.5" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

        </MagicBentoGrid>
        
        <p className="text-xs text-white/30 text-center mt-12 max-w-2xl">
          *Usage limits apply. Prices shown don't include applicable tax. Prices and plans are subject to change.
        </p>
      </div>
    </div>
  );
}
