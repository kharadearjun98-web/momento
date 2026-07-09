import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { Hash, Bell, Search, BookOpen, Compass, Home, Users, Video, BrainCircuit, Coins, Command } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { GlassPanel } from './ui/Glass';
import { UserProfile } from './UserProfile';
import { supabase } from '../lib/supabase/client';
import { SearchModal } from './SearchModal';

// Custom Memento Logo Component
const MementoLogo = () => (
  <div className="flex items-center gap-4 group cursor-pointer select-none h-10">
    <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_8px_rgba(255,255,255,0.5)] group-hover:rotate-90 transition-transform duration-700 ease-in-out">
        <g className="opacity-90">
          <ellipse cx="50" cy="50" rx="15" ry="40" fill="white" transform="rotate(0 50 50)" className="mix-blend-overlay" />
          <ellipse cx="50" cy="50" rx="15" ry="40" fill="white" transform="rotate(60 50 50)" className="mix-blend-overlay" />
          <ellipse cx="50" cy="50" rx="15" ry="40" fill="white" transform="rotate(120 50 50)" className="mix-blend-overlay" />
          <circle cx="50" cy="50" r="8" fill="white" />
        </g>
      </svg>
      <div className="absolute inset-0 bg-white/30 blur-xl rounded-full opacity-0 group-hover:opacity-60 transition-opacity duration-500" />
    </div>

    <div className="relative flex flex-col justify-center h-full">
      <span className="font-display font-bold text-white text-lg tracking-[0.25em] leading-none group-hover:text-purple-300 transition-all duration-300 group-hover:-translate-y-2">
        MEMENTO
      </span>
      <span className="absolute left-0 bottom-1 text-[8px] text-slate-500 tracking-[0.1em] uppercase opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300 whitespace-nowrap">
        Harness Your Brilliance
      </span>
    </div>
  </div>
);

export const Layout: React.FC<{ children: ReactNode }> = ({ children }) => {
  const location = useLocation();
  const isAuthPage = ['/signin', '/signup', '/reset-password', '/auth/callback', '/choose-plan'].includes(location.pathname);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [credits, setCredits] = useState<number>(0);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);

  // Fetch user credits
  useEffect(() => {
    const fetchCredits = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      console.log('Layout: User:', user?.id);
      if (user) {
        setIsLoggedIn(true);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('preferences')
          .eq('id', user.id)
          .single();
        
        console.log('Layout: Profile:', profile, 'Error:', error);
        
        // Try database first, then localStorage as fallback
        let userCredits = profile?.preferences?.credits;
        if (userCredits === undefined || userCredits === null) {
          const localCredits = localStorage.getItem('memento_user_credits');
          userCredits = localCredits ? parseInt(localCredits, 10) : 0;
          console.log('Layout: Using localStorage credits:', userCredits);
        }
        
        console.log('Layout: Final Credits:', userCredits);
        setCredits(userCredits);
      } else {
        setIsLoggedIn(false);
        setCredits(0);
      }
    };

    fetchCredits();

    // Subscribe to auth changes to refresh credits
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      console.log('Layout: Auth state changed:', event);
      fetchCredits();
    });

    return () => subscription.unsubscribe();
  }, [location.pathname]);

  const notifications = [
    {
      id: 'mentor-hour',
      title: 'New Mentor Hour',
      description: 'A new session on Neural Network Architectures is available for booking.',
      time: '2h',
      icon: <Users size={18} />,
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-400',
      unread: true,
    },
    {
      id: 'video-overview',
      title: 'Video Overview Ready',
      description: 'Your visual summary for the "Intro to ML" lecture has been rendered.',
      time: '5h',
      icon: <Video size={18} />,
      iconBg: 'bg-indigo-500/10',
      iconColor: 'text-indigo-400',
      unread: false,
    },
    {
      id: 'mind-map',
      title: 'Mind Map Updated',
      description: '3 new connections added to your Deep Learning map.',
      time: 'Yesterday',
      icon: <BrainCircuit size={18} />,
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-400',
      unread: false,
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };

    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isNotificationsOpen]);

  // Don't render layout for auth pages
  if (isAuthPage) {
    return <>{children}</>;
  }

  const handleGlobalSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (!globalSearchQuery.trim()) return;
    setIsGlobalSearchOpen(true);
  };

  return (
    <div className="min-h-screen w-screen bg-[#050608] text-slate-200 font-sans selection:bg-purple-500/30 flex flex-col overflow-hidden relative supports-[backdrop-filter]:bg-[#050608]/90">
      <SearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        initialQuery={globalSearchQuery}
      />
      {/* ============ SAFE AREA + TOP PADDING (THE FIX) ============ */}
      <div className="pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] flex flex-col h-screen">
        
        {/* Background Ambient Effects (Dark Phoenix Theme: Red/Rose/Purple) */}
        <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-rose-900/10 blur-[140px] rounded-full animate-pulse" style={{ animationDuration: '8s' }} />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-900/5 blur-[120px] rounded-full" />
          <div className="absolute top-[20%] left-[30%] w-[30%] h-[30%] bg-orange-500/5 blur-[100px] rounded-full opacity-50" />
        </div>

        {/* Top Navigation Bar */}
        <header className="relative h-[72px] shrink-0 z-50 px-6 flex items-center justify-between">
          {/* Ultra-transparent glass bar */}
          <div className="absolute inset-0 bg-white/[0.02] backdrop-blur-2xl border-b border-white/[0.04]" />
          
          {/* Left: Logo + Navigation */}
          <div className="relative z-10 flex items-center gap-6">
            <Link to="/">
              <MementoLogo />
            </Link>
            
            {/* Search Bar - Near Logo */}
            <form onSubmit={handleGlobalSearch} className="relative group w-[340px] focus-within:w-[420px] transition-all duration-300 ease-out hidden md:block">
              <div className="absolute -inset-px rounded-2xl bg-gradient-to-r from-purple-500/0 via-purple-400/25 to-cyan-400/0 opacity-0 blur-md transition-opacity duration-300 group-focus-within:opacity-100" />
              <div className="relative h-11 bg-[#070A10]/95 hover:bg-[#0D1118] focus-within:bg-[#090D14] border border-white/[0.11] focus-within:border-purple-400/45 rounded-2xl flex items-center px-3.5 transition-all shadow-[0_16px_45px_rgba(0,0,0,0.42)] backdrop-blur-2xl">
                <div className="mr-3 flex h-7 w-7 items-center justify-center rounded-xl bg-white/[0.04] border border-white/[0.07] group-focus-within:border-purple-400/25">
                  <Search size={14} className="text-slate-400 group-focus-within:text-purple-300 transition-colors shrink-0" />
                </div>
                <input
                  type="text"
                  value={globalSearchQuery}
                  onChange={(event) => setGlobalSearchQuery(event.target.value)}
                  placeholder="Search notebooks, sources, or ask..."
                  className="bg-transparent border-none outline-none text-sm text-slate-100 placeholder:text-slate-500 w-full h-full font-medium"
                />
                <div className="flex items-center gap-1.5 shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-mono text-slate-500 group-focus-within:border-purple-400/25 group-focus-within:text-slate-300">
                  <Command size={11} />
                  <span>K</span>
                </div>
              </div>
            </form>
            
            {/* Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1 ml-2">
              <Link
                to="/"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  location.pathname === '/'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Home size={16} />
                <span>Home</span>
              </Link>
              <Link
                to="/notebooks"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  location.pathname.includes('/notebook')
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <BookOpen size={16} />
                <span>Notebooks</span>
              </Link>
              <Link
                to="/discover"
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  location.pathname === '/discover'
                    ? 'bg-purple-500/20 text-purple-300'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Compass size={16} />
                <span>Discover</span>
              </Link>
            </nav>
          </div>

          {/* Right: Actions */}
          <div className="relative z-10 flex items-center justify-end gap-4 flex-1">
            {/* Credits Counter */}
            {isLoggedIn && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 rounded-full">
                <Coins size={16} className="text-amber-400" />
                <span className="text-sm font-semibold text-amber-300">{credits.toLocaleString()}</span>
              </div>
            )}
            
            {/* Action Buttons */}
            <div className="flex items-center gap-1 shrink-0" ref={notificationsRef}>
              <button
                className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors relative group"
                title="Notifications"
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                aria-haspopup="true"
                aria-expanded={isNotificationsOpen}
              >
                <Bell size={20} strokeWidth={1.5} />
                <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-[#050608]" />
              </button>

              {isNotificationsOpen && (
                <div className="absolute right-0 top-full mt-3 w-[360px] z-50">
                  <GlassPanel
                    intensity="high"
                    className="border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
                  >
                    <div className="px-4 pt-4 pb-3 border-b border-white/10 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-white">Notifications</h3>
                        <p className="text-[11px] text-slate-500">Stay in sync with your workspace</p>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-400 bg-white/5 px-2 py-1 rounded-full">
                        {notifications.length}
                      </span>
                    </div>

                    <div className="p-3 space-y-2">
                      {notifications.map((item) => (
                        <button
                          key={item.id}
                          className="w-full text-left group"
                        >
                          <div className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-all duration-300 px-3.5 py-3 flex items-start gap-3">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${item.iconBg} ${item.iconColor} shadow-inner border border-white/10`}>
                              {item.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-semibold text-white truncate">{item.title}</h4>
                                <span className="text-[10px] text-slate-500 shrink-0">{item.time}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed line-clamp-2">
                                {item.description}
                              </p>
                            </div>
                            {item.unread && (
                              <span className="mt-1 w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>

                    <div className="px-4 pb-4">
                      <button
                        type="button"
                        onClick={() => setIsNotificationsOpen(false)}
                        className="w-full text-[11px] font-semibold text-purple-300 hover:text-white transition-colors bg-white/5 hover:bg-white/10 border border-white/10 rounded-full py-2"
                      >
                        View all notifications
                      </button>
                    </div>
                  </GlassPanel>
                </div>
              )}

              <Link to="/style-guide" className="p-2.5 text-slate-400 hover:text-white hover:bg-white/5 rounded-full transition-colors" title="Design System">
                <Hash size={20} strokeWidth={1.5} />
              </Link>

              <div className="h-6 w-px bg-white/10 mx-3" />

              <UserProfile />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 relative z-10 overflow-hidden">
          {children}
        </main>

      </div>
    </div>
  );
};
