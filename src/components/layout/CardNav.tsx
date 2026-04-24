import React, { useState } from 'react';
import { GoArrowUpRight } from 'react-icons/go';
import { FiLogOut } from 'react-icons/fi';
import { useAppRouter, type AppRoute } from '../../hooks/useAppRouter';

export type CardNavLink = {
  label: string;
  href: string;
  ariaLabel: string;
};

export type CardNavItem = {
  label: string;
  bgColor: string;
  textColor: string;
  links: CardNavLink[];
};

export interface CardNavProps {
  items: CardNavItem[];
  className?: string;
  ease?: string;
  baseColor?: string;
  menuColor?: string;
  buttonBgColor?: string;
  buttonTextColor?: string;
  userName?: string;
  onLogout?: () => void;
}

export const CardNav: React.FC<CardNavProps> = ({
  items,
  className = '',
  ease: _ease = 'power3.out', // Kept for prop compatibility but unused
  baseColor = 'rgba(13, 22, 40, 0.85)',
  menuColor = '#00e5ff',
  buttonBgColor = 'rgba(0, 229, 255, 0.1)',
  buttonTextColor = '#00e5ff',
  userName = 'Operator',
  onLogout
}) => {
  const [isHamburgerOpen, setIsHamburgerOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const { navigate } = useAppRouter();

  const toggleMenu = () => {
    const opening = !isExpanded;
    setIsHamburgerOpen(opening);
    setIsExpanded(opening);
    if (!opening) {
      // Blur any focused element inside the menu to prevent aria-hidden focus warning
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest('.card-nav-content')) active.blur();
    }
  };

  return (
    <div
      className={`card-nav-container fixed left-1/2 -translate-x-1/2 w-[90%] max-w-[800px] z-[99] top-[1.2rem] md:top-[2rem] ${className}`}
    >
      <nav
        className={`card-nav ${isExpanded ? 'open' : ''} block p-0 rounded-[14px] shadow-2xl relative overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]`}
        style={{ 
          backgroundColor: baseColor,
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(0, 229, 255, 0.2)',
          maxHeight: isExpanded ? 600 : 60,
        }}
      >
        <div className="card-nav-top absolute inset-x-0 top-0 h-[60px] flex items-center justify-between p-2 pl-[1.1rem] z-[2]">
          <div
            className={`hamburger-menu ${isHamburgerOpen ? 'open' : ''} group h-full flex flex-col items-center justify-center cursor-pointer gap-[6px] order-1 md:order-none`}
            onClick={toggleMenu}
            role="button"
            aria-label={isExpanded ? 'Close menu' : 'Open menu'}
            tabIndex={0}
            style={{ color: menuColor }}
          >
            <div
              className={`hamburger-line w-[30px] h-[2px] bg-current transition-[transform,opacity,margin] duration-300 ease-linear [transform-origin:50%_50%] ${
                isHamburgerOpen ? 'translate-y-[4px] rotate-45' : ''
              } group-hover:opacity-75`}
            />
            <div
              className={`hamburger-line w-[30px] h-[2px] bg-current transition-[transform,opacity,margin] duration-300 ease-linear [transform-origin:50%_50%] ${
                isHamburgerOpen ? '-translate-y-[4px] -rotate-45' : ''
              } group-hover:opacity-75`}
            />
          </div>

          <div className="logo-container flex items-center md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 order-2 md:order-none mx-auto md:mx-0">
            <span style={{ 
              color: '#00e5ff', 
              fontFamily: '"Orbitron", monospace', 
              fontWeight: 800, 
              letterSpacing: '0.1em',
              fontSize: 'min(16px, 4vw)'
            }}>
              CYBER
              <span style={{ color: '#fff' }}>GUARDIAN</span>
            </span>
          </div>

          <div className="flex items-center gap-[6px] md:gap-4 h-full pr-1 md:pr-2 order-3 md:order-none">
            <div 
              style={{ color: 'rgba(255,255,255,0.7)', fontFamily: '"IBM Plex Mono", monospace' }} 
              className="text-[10px] md:text-[13px] tracking-wide max-w-[50px] sm:max-w-[80px] md:max-w-none truncate hidden sm:block"
            >
              OP:<span style={{ color: '#00e5ff', fontWeight: 600 }}>{userName}</span>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="card-nav-cta-button border-0 rounded-[calc(0.75rem-0.2rem)] px-2 flex items-center h-[60%] md:h-[70%] font-medium cursor-pointer transition-colors duration-300 z-10"
                style={{ backgroundColor: buttonBgColor, color: buttonTextColor, fontFamily: '"Orbitron", monospace', fontSize: '10px', letterSpacing: '0.05em' }}
                tabIndex={0}
              >
                <FiLogOut className="md:mr-2" size={14} /> <span className="hidden md:inline">LOGOUT</span>
              </button>
            )}
          </div>
        </div>

        <div
          className={`card-nav-content relative mt-[60px] p-2 flex flex-col gap-2 transition-opacity duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
            isExpanded ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          } md:flex-row md:items-stretch md:gap-[12px]`}
          {...(isExpanded ? {} : { inert: true })}
        >
          {(items || []).slice(0, 3).map((item, idx) => (
            <div
              key={`${item.label}-${idx}`}
              className="nav-card select-none relative flex flex-col gap-2 p-[16px_20px] rounded-[calc(0.75rem-0.2rem)] min-w-0 flex-[1_1_auto] transition-transform hover:scale-[1.02]"
              style={{ backgroundColor: item.bgColor, color: item.textColor, border: '1px solid rgba(255,255,255,0.05)' }}
            >
              <div className="nav-card-label font-medium tracking-wide text-[16px] md:text-[18px] uppercase" style={{ fontFamily: '"Orbitron", monospace' }}>
                {item.label}
              </div>
              <div className="nav-card-links mt-auto flex flex-col gap-[6px]">
                {item.links?.map((lnk, i) => (
                  <a
                    key={`${lnk.label}-${i}`}
                    className="nav-card-link inline-flex items-center gap-[6px] no-underline cursor-pointer transition-colors duration-300 hover:text-[#00e5ff] text-[13px] md:text-[14px]"
                    onClick={(e) => {
                      e.preventDefault();
                      navigate(lnk.href as AppRoute);
                      toggleMenu();
                    }}
                    href={lnk.href}
                    aria-label={lnk.ariaLabel}
                    tabIndex={isExpanded ? 0 : -1}
                    style={{ fontFamily: '"IBM Plex Mono", monospace' }}
                  >
                    <GoArrowUpRight className="nav-card-link-icon shrink-0" aria-hidden="true" />
                    {lnk.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>
    </div>
  );
};
