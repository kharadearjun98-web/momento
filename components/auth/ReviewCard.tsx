import React from 'react';

// Company logos as SVG components
const CompanyLogos = {
  vertex: () => (
    <svg className="h-5 w-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L2 22h20L12 2z" />
    </svg>
  ),
  orbit: () => (
    <svg className="h-5 w-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" fill="none" r="4" stroke="#191022" strokeWidth="2" />
    </svg>
  ),
  linear: () => (
    <svg className="h-5 w-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path d="M7 12l5 5L22 7" />
      <path d="M2 12l5 5m0-5l5-5" />
    </svg>
  ),
  bolt: () => (
    <svg className="h-5 w-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  codex: () => (
    <svg className="h-5 w-5 text-white/90" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
      <path d="M16 18L22 12L16 6" />
      <path d="M8 6L2 12L8 18" />
    </svg>
  ),
  box: () => (
    <svg className="h-5 w-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L2 7l10 5 10-5-10-5zm0 9l2.5-1.25L12 12l-2.5-2.25L12 11zm0 2.5l-5-2.5-5 2.5L12 22l10-8.5-5-2.5-5 2.5z" />
    </svg>
  ),
  shield: () => (
    <svg className="h-5 w-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  ),
  prism: () => (
    <svg className="h-5 w-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
    </svg>
  ),
  pulse: () => (
    <svg className="h-5 w-5 text-white/90" fill="currentColor" viewBox="0 0 24 24">
      <path d="M22 10h-6l-4 9-2-6H4V8h6l4-9 2 6h6v5z" />
    </svg>
  ),
};

export type CompanyName = keyof typeof CompanyLogos;

export interface ReviewCardProps {
  name: string;
  role: string;
  quote: string;
  company: CompanyName;
  avatarUrl?: string;
  initials?: string;
  initialsColor?: string;
  isHighlighted?: boolean;
}

export const ReviewCard: React.FC<ReviewCardProps> = ({
  name,
  role,
  quote,
  company,
  avatarUrl,
  initials,
  initialsColor = 'bg-indigo-500',
  isHighlighted = false,
}) => {
  const LogoComponent = CompanyLogos[company];
  const companyDisplayName = company.charAt(0).toUpperCase() + company.slice(1);

  return (
    <div
      className={`glass-review-card rounded-xl p-6 transform transition-transform duration-300 flex flex-col ${
        isHighlighted
          ? 'border-white/20 bg-white/10 shadow-[0_10px_40px_rgba(0,0,0,0.2)]'
          : ''
      }`}
    >
      {/* Header: Avatar + Name */}
      <div className="flex items-center gap-4 mb-3">
        {avatarUrl ? (
          <img
            className="h-10 w-10 rounded-full object-cover border-2 border-white/20 shadow-lg"
            src={avatarUrl}
            alt={name}
          />
        ) : (
          <div
            className={`h-10 w-10 rounded-full ${initialsColor} flex items-center justify-center text-sm font-bold border-2 border-white/20 shadow-lg`}
          >
            {initials || name.split(' ').map(n => n[0]).join('').slice(0, 2)}
          </div>
        )}
        <div>
          <h4 className="text-sm font-bold text-white font-display">{name}</h4>
          <p className="text-[10px] text-white/60 uppercase tracking-widest font-display">
            {role}
          </p>
        </div>
      </div>

      {/* Quote */}
      <p className={`text-xs leading-relaxed mb-4 ${isHighlighted ? 'text-gray-100 font-medium' : 'text-gray-300'}`}>
        "{quote}"
      </p>

      {/* Company Logo */}
      <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-2.5">
        <LogoComponent />
        <span className="font-display font-bold text-white/90 text-[11px] tracking-widest uppercase">
          {companyDisplayName}
        </span>
      </div>
    </div>
  );
};

export default ReviewCard;
