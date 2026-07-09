import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'glow';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading = false, 
  icon,
  className = '',
  ...props 
}) => {
  // Modern variants use the "Border Beam" structure
  const isModern = variant === 'primary' || variant === 'glow';

  // Split sizing logic: Parent controls geometry (height/width), Child controls internal spacing (padding)
  const sizeConfig = {
    sm: { 
      parent: "h-8", 
      child: "px-4 text-xs",
      icon: "h-4 w-4"
    },
    md: { 
      parent: "h-10", 
      child: "px-6 text-sm",
      icon: "h-4 w-4"
    },
    lg: { 
      parent: "h-14", 
      child: "px-8 text-base font-semibold tracking-wide", // Increased font size and weight
      icon: "h-5 w-5"
    },
    icon: { 
      parent: "h-10 w-10", 
      child: "p-0",
      icon: "h-5 w-5"
    },
  };

  const currentConfig = sizeConfig[size];

  // -- MODERN BUTTON RENDER (Primary/Glow with moving light) --
  if (isModern) {
    const beamGradient = variant === 'primary'
      ? "bg-[conic-gradient(from_90deg_at_50%_50%,#0000_0%,#8B5CF6_50%,#0000_100%)]"
      : "bg-[conic-gradient(from_90deg_at_50%_50%,#0000_0%,#22D3EE_50%,#0000_100%)]";
      
    const glowColor = variant === 'primary' ? 'bg-memento-purple-500' : 'bg-memento-accent-cyan';

    return (
      <button 
        className={`relative inline-flex overflow-hidden rounded-full p-[2px] focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900 group transition-all active:scale-[0.98] ${currentConfig.parent} ${className}`}
        disabled={isLoading || props.disabled}
        {...props}
      >
        {/* Moving Light Beam (Spinning Gradient) */}
        <span className={`absolute inset-[-1000%] animate-spin-slow ${beamGradient}`} />
        
        {/* Ambient Glow behind the beam */}
        <span className={`absolute inset-[-100%] animate-spin-slow blur-3xl opacity-40 ${beamGradient}`} />
        
        {/* Inner Button Face (Covers the center of the beam) */}
        <span className={`inline-flex h-full w-full cursor-pointer items-center justify-center rounded-full bg-[#161b26] backdrop-blur-3xl transition-all duration-300 group-hover:bg-[#1c2230] ${currentConfig.child}`}>
          
          {/* Subtle inner highlight */}
          <div className="absolute inset-0 rounded-full border border-white/5" />
          
          {/* Text Content */}
          <div className={`flex items-center gap-2.5 relative z-10 ${variant === 'glow' ? 'text-slate-100 group-hover:text-white' : 'text-white'}`}>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {icon && <span className={`opacity-90 group-hover:scale-110 transition-transform duration-300 ${currentConfig.icon}`}>{icon}</span>}
                <span>{children}</span>
              </>
            )}
          </div>
        </span>
      </button>
    );
  }

  // -- CLASSIC BUTTON RENDER (Secondary, Ghost, Outline) --
  
  const baseStyles = "inline-flex items-center justify-center rounded-full font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0B0E13] disabled:opacity-50 disabled:pointer-events-none relative overflow-hidden group tracking-tight";
  
  const variants = {
    secondary: "bg-white/5 text-slate-300 backdrop-blur-md border border-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 shadow-sm",
    ghost: "text-slate-400 hover:text-white hover:bg-white/5",
    outline: "border border-slate-700 text-slate-300 hover:border-memento-purple-500 hover:text-memento-purple-400",
    // Primary/Glow are handled above, kept here for type safety fallback
    primary: "",
    glow: ""
  };

  // For classic buttons, we combine parent/child classes onto the single element
  const classicSizeClasses = `${currentConfig.parent} ${currentConfig.child}`;

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${classicSizeClasses} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      <div className="relative z-10 flex items-center gap-2.5">
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <>
            {icon && <span className={`opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300 ${currentConfig.icon}`}>{icon}</span>}
            <span>{children}</span>
          </>
        )}
      </div>
    </button>
  );
};