import React from 'react';
import { ReviewCard, ReviewCardProps } from './ReviewCard';

// EXTENDED MEMENTO-SPECIFIC testimonial data - 18 testimonials for 2-minute loop
const testimonials: ReviewCardProps[] = [
    // Column 1 testimonials (0-5)
    {
        name: 'Sarah Jenkins',
        role: 'PhD Researcher',
        quote: 'Memento turned 40 research papers into a cohesive knowledge graph overnight. The AI connections I would have missed are invaluable.',
        company: 'vertex',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCfFrMN26tDAXvkFQOtxnLU9WI_kK8g_Xgql7sYdw0nBwrwUFPFADuRwqhWFUrvE3tTg1XqzOS-nV4Hyt7FJqSwg6MvPpFAurYQKlB2ACJV7_kvkqh09a1LG9rMVWoJ5tc6zcXM4YGmwh_NeT2HiLnJJM72wFCkReoaDEv0PoFN4zB80UBSXN0tFy3q4NHlDhqHTcdBTqLr2bOW9Sdv8gBDjR5WVbCCBiVrz4zR17sA2cacLwpiL3d9sHdSw7H_kAwCQQG4j9Ge9i4',
    },
    {
        name: 'Marcus Taylor',
        role: 'Data Scientist',
        quote: 'The semantic search is unreal. Found a paper from 2018 that perfectly contradicted my hypothesis. Saved months of work.',
        company: 'orbit',
        initials: 'MT',
        initialsColor: 'bg-emerald-500',
    },
    {
        name: 'David Chen',
        role: 'Tech Lead',
        quote: 'The AI Podcast feature is genius. I listen to my own research papers as debates during my commute. 94% retention rate!',
        company: 'linear',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBnFyf6zY_EuP020NUQS_UI_u1dCmlNYi4k67gGVcQxO50MHehKDZl1cUlsTh0Vumz9azPIgsIiQPa1cfQuu8IMFthBJueSkPKg7G1aHO7qHKdkZgBCWVMG9ObFmFZ3bFhj_e-84Y4YhQm4zVQFx63wRjieO71A1YPFpsD8ht9i5b8i-9qHd9xIRL2OmowddBdZNGvvBjrs8rrjlMZk5LbsMel7yMIZzakEb7QuMOpCVYX9hY85IRzSw-g5OwY8Dv-Re2XiuBiN6VM',
    },
    {
        name: 'Maria K.',
        role: 'Medical Student',
        quote: 'Deep Research caught contradictions in my notes I never noticed. The fact-checking saved me from citing outdated studies.',
        company: 'shield',
        initials: 'MK',
        initialsColor: 'bg-indigo-500',
    },
    {
        name: 'Nathan Brooks',
        role: 'Consultant',
        quote: 'Generated a 10-episode podcast series from my McKinsey case archives. Clients think I hired a production team.',
        company: 'bolt',
        initials: 'NB',
        initialsColor: 'bg-amber-500',
    },
    {
        name: 'Priya Sharma',
        role: 'Professor',
        quote: 'My students love the auto-generated courses. Complex topics become digestible 15-minute modules automatically.',
        company: 'prism',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB6qM91X6WsJQPGJXJCVDwBAsDHKETEZIPjn_1vZDI4hOGmfKhymcid-cwjkKcKQawU2r4qBSZJM-NA5cYC-hnCSwtnLlrJHsQi8KWcQpDG6Lxue5xDvBA5CfSN8762TqDAuM2r-DteHKTus59Oq0zanfm93KRbSidkgyCbSCpG-c3bJ-3_CaNSt-TSoc4qOcgOoeX27FNaEg_EzLbAK5MHJRcTdbRIgokpIhYmVgAceNTgWDyJ7uBgPHjVRcZp3v9c6hVr5Cog608',
    },

    // Column 2 testimonials (6-11) - highlighted
    {
        name: 'Elena Rodriguez',
        role: 'Content Creator',
        quote: 'Auto Video transformed my lecture notes into professional mini-documentaries. My YouTube channel exploded.',
        company: 'bolt',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB6qM91X6WsJQPGJXJCVDwBAsDHKETEZIPjn_1vZDI4hOGmfKhymcid-cwjkKcKQawU2r4qBSZJM-NA5cYC-hnCSwtnLlrJHsQi8KWcQpDG6Lxue5xDvBA5CfSN8762TqDAuM2r-DteHKTus59Oq0zanfm93KRbSidkgyCbSCpG-c3bJ-3_CaNSt-TSoc4qOcgOoeX27FNaEg_EzLbAK5MHJRcTdbRIgokpIhYmVgAceNTgWDyJ7uBgPHjVRcZp3v9c6hVr5Cog608',
        isHighlighted: true,
    },
    {
        name: 'Alex Lewis',
        role: 'Developer',
        quote: "Source management finally makes sense. PDFs, YouTube, articles—all auto-tagged and cross-referenced instantly.",
        company: 'codex',
        initials: 'AL',
        initialsColor: 'bg-pink-500',
        isHighlighted: true,
    },
    {
        name: 'James Wilson',
        role: 'Product Manager',
        quote: 'Debate Room is addictive. Spawned 4 AI experts to argue product strategy—got insights our team never produced.',
        company: 'box',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBnFyf6zY_EuP020NUQS_UI_u1dCmlNYi4k67gGVcQxO50MHehKDZl1cUlsTh0Vumz9azPIgsIiQPa1cfQuu8IMFthBJueSkPKg7G1aHO7qHKdkZgBCWVMG9ObFmFZ3bFhj_e-84Y4YhQm4zVQFx63wRjieO71A1YPFpsD8ht9i5b8i-9qHd9xIRL2OmowddBdZNGvvBjrs8rrjlMZk5LbsMel7yMIZzakEb7QuMOpCVYX9hY85IRzSw-g5OwY8Dv-Re2XiuBiN6VM',
        isHighlighted: true,
    },
    {
        name: 'Olivia Park',
        role: 'Strategy Director',
        quote: 'Knowledge synthesis at scale. Connected insights from 200+ documents in minutes. This is how research should work.',
        company: 'vertex',
        initials: 'OP',
        initialsColor: 'bg-violet-500',
        isHighlighted: true,
    },
    {
        name: 'Raj Patel',
        role: 'Startup Founder',
        quote: 'Built an entire onboarding course from our wiki in one afternoon. New hires get up to speed 3x faster now.',
        company: 'pulse',
        initials: 'RP',
        initialsColor: 'bg-rose-500',
        isHighlighted: true,
    },
    {
        name: 'Sophie Laurent',
        role: 'Investment Analyst',
        quote: 'The AI summarizes earnings calls into key insights. What took me 2 hours now takes 5 minutes. Game changer.',
        company: 'orbit',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCfFrMN26tDAXvkFQOtxnLU9WI_kK8g_Xgql7sYdw0nBwrwUFPFADuRwqhWFUrvE3tTg1XqzOS-nV4Hyt7FJqSwg6MvPpFAurYQKlB2ACJV7_kvkqh09a1LG9rMVWoJ5tc6zcXM4YGmwh_NeT2HiLnJJM72wFCkReoaDEv0PoFN4zB80UBSXN0tFy3q4NHlDhqHTcdBTqLr2bOW9Sdv8gBDjR5WVbCCBiVrz4zR17sA2cacLwpiL3d9sHdSw7H_kAwCQQG4j9Ge9i4',
        isHighlighted: true,
    },

    // Column 3 testimonials (12-17)
    {
        name: 'Tom Young',
        role: 'CTO',
        quote: 'Voice Cloning lets me hear complex papers in my own voice. It feels like future-me teaching past-me.',
        company: 'shield',
        initials: 'TY',
        initialsColor: 'bg-cyan-600',
    },
    {
        name: 'Jessica P.',
        role: 'Neuroscience PhD',
        quote: "Auto-Discovery proactively finds papers I didn't know existed. Like having a research assistant that never sleeps.",
        company: 'prism',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCfFrMN26tDAXvkFQOtxnLU9WI_kK8g_Xgql7sYdw0nBwrwUFPFADuRwqhWFUrvE3tTg1XqzOS-nV4Hyt7FJqSwg6MvPpFAurYQKlB2ACJV7_kvkqh09a1LG9rMVWoJ5tc6zcXM4YGmwh_NeT2HiLnJJM72wFCkReoaDEv0PoFN4zB80UBSXN0tFy3q4NHlDhqHTcdBTqLr2bOW9Sdv8gBDjR5WVbCCBiVrz4zR17sA2cacLwpiL3d9sHdSw7H_kAwCQQG4j9Ge9i4',
    },
    {
        name: 'Ryan F.',
        role: 'Law Student',
        quote: 'Synthesized 200 case studies into an interactive course. Memento builds knowledge graphs I can actually navigate.',
        company: 'pulse',
        initials: 'RF',
        initialsColor: 'bg-purple-600',
    },
    {
        name: 'Amara Okonkwo',
        role: 'Biotech Researcher',
        quote: 'Cross-referenced 3 years of lab notes automatically. Found a pattern that led to our breakthrough paper.',
        company: 'linear',
        initials: 'AO',
        initialsColor: 'bg-teal-500',
    },
    {
        name: 'Chen Wei',
        role: 'UX Lead',
        quote: 'Turned 50 user interviews into a synthesized insights report with citations. Leadership was blown away.',
        company: 'codex',
        initials: 'CW',
        initialsColor: 'bg-orange-500',
    },
    {
        name: 'Isabella Rossi',
        role: 'Author',
        quote: 'The podcast debates on my book chapters helped me find plot holes before my editor did. Brilliant tool.',
        company: 'box',
        avatarUrl: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB6qM91X6WsJQPGJXJCVDwBAsDHKETEZIPjn_1vZDI4hOGmfKhymcid-cwjkKcKQawU2r4qBSZJM-NA5cYC-hnCSwtnLlrJHsQi8KWcQpDG6Lxue5xDvBA5CfSN8762TqDAuM2r-DteHKTus59Oq0zanfm93KRbSidkgyCbSCpG-c3bJ-3_CaNSt-TSoc4qOcgOoeX27FNaEg_EzLbAK5MHJRcTdbRIgokpIhYmVgAceNTgWDyJ7uBgPHjVRcZp3v9c6hVr5Cog608',
    },
];

interface TestimonialsColumnProps {
    speed: 'slow' | 'medium' | 'fast';
    startIndex?: number;
    isHighlighted?: boolean;
    className?: string;
}

export const TestimonialsColumn: React.FC<TestimonialsColumnProps> = ({
    speed,
    startIndex = 0,
    isHighlighted = false,
    className = '',
}) => {
    // Animation duration - extended for 2-minute loop with 6 cards per column
    const animationDuration = {
        slow: 120,    // 2 minutes for slow column
        medium: 100,  // ~1:40 for medium
        fast: 80,     // ~1:20 for fast
    }[speed];

    // Get 6 testimonials starting from startIndex
    const columnTestimonials = Array.from({ length: 6 }, (_, i) =>
        testimonials[(startIndex + i) % testimonials.length]
    );

    // Duplicate for seamless loop
    const allCards = [...columnTestimonials, ...columnTestimonials];

    return (
        <div
            className={`flex flex-col gap-6 w-80 ${isHighlighted ? 'z-10' : 'opacity-90 hover:opacity-100 transition-opacity duration-500'
                } ${className}`}
            style={{
                animation: `scroll-vertical ${animationDuration}s linear infinite`,
            }}
        >
            {allCards.map((testimonial, index) => (
                <ReviewCard
                    key={`${testimonial.name}-${index}`}
                    {...testimonial}
                    isHighlighted={isHighlighted}
                />
            ))}
        </div>
    );
};

// Full testimonial wall with 3 columns
export const TestimonialsWall: React.FC = () => {
    return (
        <div
            className="absolute inset-0 z-0 flex gap-6 p-8 justify-center gradient-mask-y"
            style={{
                height: '180vh',
                top: '-40vh',
                transform: 'rotateX(15deg) rotateY(-10deg) rotateZ(5deg) scale(1.05)',
                transformStyle: 'preserve-3d',
            }}
        >
            {/* Column 1 - Slow (120s) */}
            <TestimonialsColumn speed="slow" startIndex={0} className="pt-24" />

            {/* Column 2 - Fast (80s), highlighted */}
            <TestimonialsColumn speed="fast" startIndex={6} isHighlighted />

            {/* Column 3 - Medium (100s) */}
            <TestimonialsColumn speed="medium" startIndex={12} className="pt-12" />
        </div>
    );
};

export default TestimonialsWall;
