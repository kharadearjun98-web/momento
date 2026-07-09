import React from 'react';
import { TestimonialsWall } from './TestimonialsColumn';

interface AuthLayoutProps {
    children: React.ReactNode;
    headline?: string;
    subheadline?: string;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
    children,
    headline = 'Start your journey.',
    subheadline = 'Join the elite platform for advanced learning today.',
}) => {
    return (
        <div
            className="flex min-h-screen w-full text-white antialiased overflow-x-hidden"
            style={{ fontFamily: "'Inter', sans-serif" }}
        >
            {/* Left Panel - Testimonials Wall */}
            <div
                className="relative w-1/2 flex-col items-center justify-center overflow-hidden mesh-gradient iso-container"
                style={{
                    display: 'flex',
                    minHeight: '100vh',
                }}
            >
                {/* Noise overlay */}
                <div
                    className="absolute inset-0 z-0 pointer-events-none"
                    style={{
                        backgroundImage: "url('https://grainy-gradients.vercel.app/noise.svg')",
                        opacity: 0.2,
                        mixBlendMode: 'overlay',
                    }}
                />

                {/* Scrolling testimonials */}
                <TestimonialsWall />

                {/* "Master your craft" banner - Fixed at bottom */}
                <div
                    className="absolute inset-0 z-30 flex items-center justify-center px-6"
                    style={{
                        background: 'linear-gradient(to top, rgba(25, 16, 34, 0.6) 0%, rgba(25, 16, 34, 0.35) 40%, rgba(25, 16, 34, 0.15) 70%, transparent 100%)',
                    }}
                >
                    <div
                        className="text-center max-w-lg p-8 rounded-2xl"
                        style={{
                            background: 'rgba(0, 0, 0, 0.7)',
                            backdropFilter: 'blur(24px)',
                            WebkitBackdropFilter: 'blur(24px)',
                            border: '1px solid rgba(255, 255, 255, 0.15)',
                            boxShadow: '0 -10px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(140, 43, 238, 0.15)',
                        }}
                    >
                        <h2
                            className="text-3xl md:text-4xl font-bold tracking-tight text-white mb-3"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                            Master your craft.
                        </h2>
                        <p className="text-white/85 text-base md:text-lg leading-relaxed font-light">
                            Join a community of forward-thinkers building the future of digital experiences with Memento.
                        </p>
                    </div>
                </div>
            </div>

            {/* Right Panel - Form */}
            <div
                className="flex flex-1 flex-col justify-center px-4 py-12 lg:px-20 xl:px-32 relative"
                style={{
                    width: '50%',
                    backgroundColor: '#0f0f12',
                }}
            >
                {/* Background glow */}
                <div
                    className="absolute top-0 right-0 pointer-events-none"
                    style={{
                        marginTop: '-80px',
                        marginRight: '-80px',
                        height: '500px',
                        width: '500px',
                        borderRadius: '50%',
                        background: 'rgba(140, 43, 238, 0.1)',
                        filter: 'blur(100px)',
                    }}
                />

                <div className="relative z-10 w-full max-w-[480px] mx-auto">
                    {/* Headlines */}
                    <div className="mb-10 text-center lg:text-left">
                        <h1
                            className="text-5xl font-bold tracking-tight text-white mb-3"
                            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                            {headline}
                        </h1>
                        <h2 className="text-lg text-gray-400 font-light">
                            {subheadline}
                        </h2>
                    </div>

                    {/* Form content (passed as children) */}
                    {children}

                    {/* Social proof */}
                    <div className="mt-10 flex items-center justify-center gap-4 opacity-90 hover:opacity-100 transition-opacity">
                        {/* Avatar stack */}
                        <div className="flex -space-x-3">
                            <img
                                alt="User"
                                className="h-10 w-10 rounded-full object-cover"
                                style={{ border: '2px solid #0f0f12' }}
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCfFrMN26tDAXvkFQOtxnLU9WI_kK8g_Xgql7sYdw0nBwrwUFPFADuRwqhWFUrvE3tTg1XqzOS-nV4Hyt7FJqSwg6MvPpFAurYQKlB2ACJV7_kvkqh09a1LG9rMVWoJ5tc6zcXM4YGmwh_NeT2HiLnJJM72wFCkReoaDEv0PoFN4zB80UBSXN0tFy3q4NHlDhqHTcdBTqLr2bOW9Sdv8gBDjR5WVbCCBiVrz4zR17sA2cacLwpiL3d9sHdSw7H_kAwCQQG4j9Ge9i4"
                            />
                            <img
                                alt="User"
                                className="h-10 w-10 rounded-full object-cover"
                                style={{ border: '2px solid #0f0f12' }}
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBnFyf6zY_EuP020NUQS_UI_u1dCmlNYi4k67gGVcQxO50MHehKDZl1cUlsTh0Vumz9azPIgsIiQPa1cfQuu8IMFthBJueSkPKg7G1aHO7qHKdkZgBCWVMG9ObFmFZ3bFhj_e-84Y4YhQm4zVQFx63wRjieO71A1YPFpsD8ht9i5b8i-9qHd9xIRL2OmowddBdZNGvvBjrs8rrjlMZk5LbsMel7yMIZzakEb7QuMOpCVYX9hY85IRzSw-g5OwY8Dv-Re2XiuBiN6VM"
                            />
                            <img
                                alt="User"
                                className="h-10 w-10 rounded-full object-cover"
                                style={{ border: '2px solid #0f0f12' }}
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuB6qM91X6WsJQPGJXJCVDwBAsDHKETEZIPjn_1vZDI4hOGmfKhymcid-cwjkKcKQawU2r4qBSZJM-NA5cYC-hnCSwtnLlrJHsQi8KWcQpDG6Lxue5xDvBA5CfSN8762TqDAuM2r-DteHKTus59Oq0zanfm93KRbSidkgyCbSCpG-c3bJ-3_CaNSt-TSoc4qOcgOoeX27FNaEg_EzLbAK5MHJRcTdbRIgokpIhYmVgAceNTgWDyJ7uBgPHjVRcZp3v9c6hVr5Cog608"
                            />
                            <div
                                className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white"
                                style={{
                                    border: '2px solid #0f0f12',
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    backdropFilter: 'blur(4px)',
                                    fontFamily: "'Space Grotesk', sans-serif",
                                }}
                            >
                                +5k
                            </div>
                        </div>

                        {/* Rating */}
                        <div className="flex flex-col">
                            <div className="flex items-center gap-1 mb-1">
                                {[...Array(5)].map((_, i) => (
                                    <svg
                                        key={i}
                                        className="w-4 h-4 text-yellow-400 fill-current star-glow"
                                        viewBox="0 0 20 20"
                                    >
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                    </svg>
                                ))}
                            </div>
                            <span
                                className="text-xs font-semibold text-gray-300 tracking-wide"
                                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                            >
                                Join 50,000+ learners
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;
