import React, { useState } from 'react';

interface FrostGlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: string | number;
  borderRadius?: string | number;
}

export function FrostGlass({
  children,
  padding,
  borderRadius = '24px',
  className = '',
  style = {},
  onMouseEnter,
  onMouseLeave,
  ...props
}: FrostGlassProps) {
  const [isHovered, setIsHovered] = useState(false);

  const baseStyle: React.CSSProperties = {
    background: isHovered 
      ? 'linear-gradient(135deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0.08) 100%)'
      : 'linear-gradient(135deg, rgba(255, 255, 255, 0.10) 0%, rgba(255, 255, 255, 0.05) 100%)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)', // for Safari support
    border: '1px solid rgba(255, 255, 255, 0.2)',
    boxShadow: isHovered
      ? '0 20px 40px rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.2)'
      : '0 16px 32px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
    borderRadius,
    padding,
    transition: 'all 0.25s ease-out',
    ...style,
  };

  return (
    <div
      className={className}
      style={baseStyle}
      onMouseEnter={(e) => {
        setIsHovered(true);
        if (onMouseEnter) onMouseEnter(e);
      }}
      onMouseLeave={(e) => {
        setIsHovered(false);
        if (onMouseLeave) onMouseLeave(e);
      }}
      {...props}
    >
      {children}
    </div>
  );
}
