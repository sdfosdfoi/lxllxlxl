import React from 'react';

interface LogoProps {
  className?: string;
  size?: number;
}

const Logo: React.FC<LogoProps> = ({ className = '', size = 30 }) => {
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      className={className}
    >
      <circle 
        cx="50" 
        cy="50" 
        r="42" 
        stroke="currentColor" 
        strokeWidth="3" 
        fill="none"
      />
      <text
        x="50"
        y="50"
        dominantBaseline="middle"
        textAnchor="middle"
        style={{
          fontSize: '35px',
          fontWeight: '700',
          fontFamily: 'Inter, sans-serif',
          fill: 'currentColor',
          letterSpacing: '-0.5px'
        }}
      >
        SWR
      </text>
    </svg>
  );
};

export default Logo;