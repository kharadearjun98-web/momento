
import React from 'react';

interface GlassProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  intensity?: 'low' | 'medium' | 'high';
  hoverEffect?: boolean;
  interactive?: boolean;
  variant?: 'panel' | 'card' | 'pill';
  noShine?: boolean;
}

export const GlassPanel: React.FC<GlassProps> = ({
  children,
  className = '',
  intensity = 'medium',
  hoverEffect = false,
  interactive = false,
  variant = 'panel',
  noShine = false,
  ...props
}) => {
  const baseStyles = "relative overflow-hidden transition-all duration-300 ease-out flex flex-col";

  const intensityStyles = {
    low: "bg-[#0F1218]/40 backdrop-blur-md",
    medium: "bg-[#0F1218]/60 backdrop-blur-xl",
    high: "bg-[#0F1218]/80 backdrop-blur-2xl",
  };

  // Check if custom border is provided in className
  const hasCustomBorder = className.includes('border-') || className.includes('border ');
  const defaultBorder = hasCustomBorder ? '' : 'border border-white/10';

  const variantStyles = {
    panel: `rounded-2xl shadow-glass ${defaultBorder}`,
    card: `rounded-xl shadow-lg ${defaultBorder}`,
    pill: `rounded-full shadow-sm ${defaultBorder}`,
  };

  const hoverStyles = hoverEffect
    ? "hover:bg-[#0F1218]/70 hover:border-memento-purple-500/30 hover:shadow-glass-hover hover:-translate-y-1"
    : "";

  const interactiveStyles = interactive ? "cursor-pointer active:scale-[0.98]" : "";

  return (
    <div
      className={`${baseStyles} ${intensityStyles[intensity]} ${variantStyles[variant]} ${hoverStyles} ${interactiveStyles} ${className}`}
      {...props}
    >
      {/* Shine effect overlay - can be disabled via noShine prop */}
      {!noShine && <div className="absolute inset-0 bg-glass-gradient pointer-events-none opacity-50" />}
      {/* Inner wrapper must fill space so children can use flex/grid properly */}
      <div className="relative z-10 w-full flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
};

export const Glow: React.FC<{ color?: string, className?: string }> = ({ color = '#8B5CF6', className = '' }) => (
  <div
    className={`absolute pointer-events-none opacity-20 blur-[80px] rounded-full ${className}`}
    style={{ backgroundColor: color }}
  />
);
