
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, BookOpen, Clock, ArrowRight, Sparkles } from 'lucide-react';
import { GlassPanel, Glow } from '../components/ui/Glass';
import { Button } from '../components/ui/Button';
import { Notebook } from '../types';
import { DigitalRain } from '../components/DigitalRain';
import { supabase } from '../lib/supabase/client';

const RECENT_NOTEBOOKS: Notebook[] = [
  { id: '1', title: 'Neuroscience & Focus', lastEdited: '2m ago', sourceCount: 5, coverColor: '#8B5CF6' },
  { id: '2', title: 'Q4 Marketing Strategy', lastEdited: '4h ago', sourceCount: 12, coverColor: '#22D3EE' },
  { id: '3', title: 'Renaissance Art History', lastEdited: '1d ago', sourceCount: 8, coverColor: '#F472B6' },
];

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [userName, setUserName] = useState('');
  const [currentStreak, setCurrentStreak] = useState<number | null>(null);
  const [recentNotebooks, setRecentNotebooks] = useState<Notebook[]>([]);
  const [isLoadingNotebooks, setIsLoadingNotebooks] = useState(true);

  // Get user name and recent notebooks
  useEffect(() => {
    const getUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const name = user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          user.email?.split('@')[0] ||
          'there';
        setUserName(name.split(' ')[0]); // Get first name only

        const { data: activityRows } = await supabase
          .from('user_activity')
          .select('created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(90);

        if (activityRows?.length) {
          const activeDays = new Set(
            activityRows.map((row: any) => new Date(row.created_at).toISOString().slice(0, 10)),
          );
          const cursor = new Date();
          let streak = 0;

          while (activeDays.has(cursor.toISOString().slice(0, 10))) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
          }

          setCurrentStreak(streak);
        } else {
          setCurrentStreak(0);
        }

        // Fetch recent notebooks from database
        const { data: notebooks, error } = await supabase
          .from('notebooks')
          .select(`
            id,
            title,
            updated_at,
            sources (count)
          `)
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(6);

        if (!error && notebooks) {
          const formattedNotebooks = notebooks.map((nb: any, index: number) => {
            const colors = ['#8B5CF6', '#22D3EE', '#F472B6', '#10B981', '#F59E0B', '#EF4444'];
            const now = new Date();
            const updated = new Date(nb.updated_at);
            const diffMs = now.getTime() - updated.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);

            let lastEdited = 'Just now';
            if (diffMins < 60) {
              lastEdited = `${diffMins}m ago`;
            } else if (diffHours < 24) {
              lastEdited = `${diffHours}h ago`;
            } else {
              lastEdited = `${diffDays}d ago`;
            }

            return {
              id: nb.id,
              title: nb.title,
              lastEdited,
              sourceCount: nb.sources?.[0]?.count || 0,
              coverColor: colors[index % colors.length],
            };
          });

          setRecentNotebooks(formattedNotebooks);
        }
        setIsLoadingNotebooks(false);
      }
    };
    getUserData();
  }, []);

  // Handle Mouse Move for 3D Parallax Effect
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;

    const { clientX, clientY } = e;
    const { innerWidth, innerHeight } = window;

    // Calculate normalized position (-1 to 1)
    const x = (clientX - innerWidth / 2) / (innerWidth / 2);
    const y = (clientY - innerHeight / 2) / (innerHeight / 2);

    setMousePos({ x, y });
  };

  // Reset on leave
  const handleMouseLeave = () => {
    setMousePos({ x: 0, y: 0 });
  };

  return (
    <div
      className="h-full overflow-hidden relative perspective-[2000px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* Background: Phoenix Fire Stream */}
      <DigitalRain />

      {/* Deep Ambient Glows (Red/Purple for Dark Phoenix theme) */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <Glow className="top-[-20%] left-[10%] w-[900px] h-[900px] bg-red-900/10 blur-[120px] mix-blend-screen" />
        <Glow className="bottom-[-10%] right-[10%] w-[800px] h-[800px] bg-purple-900/10 blur-[120px] mix-blend-screen" />
      </div>

      <div className="h-full overflow-y-auto custom-scrollbar p-8 relative z-10">
        <div
          ref={containerRef}
          className="max-w-6xl mx-auto space-y-12 transition-transform duration-200 ease-out will-change-transform"
          style={{
            transform: `rotateX(${mousePos.y * -1}deg) rotateY(${mousePos.x * 1}deg)`
          }}
        >
          {/* Hero Section */}
          <div className="flex flex-col items-center text-center space-y-8 py-12 md:py-20 relative">

            {/* Interactive Hero Text - Updated to Fire Gradients */}
            <h1 className="font-display text-6xl md:text-8xl font-bold tracking-tight drop-shadow-2xl relative z-20 group cursor-default">
              <span className="bg-clip-text text-transparent bg-gradient-to-b from-white via-orange-100 to-slate-400 group-hover:to-orange-300 transition-all duration-500">
                Harness Your
              </span>
              <br />
              <span className="relative inline-block">
                <span className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-orange-400 to-purple-500 animate-text-shimmer bg-[length:200%_auto]">
                  Brilliance.
                </span>
              </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-400 max-w-2xl leading-relaxed relative z-20 backdrop-blur-sm rounded-xl p-4 border border-white/0 hover:border-white/5 hover:bg-white/5 transition-all duration-500">
              Welcome back, {userName}.
              {currentStreak ? (
                <>
                  {' '}You're on a <span className="text-orange-400 font-semibold relative">
                    {currentStreak}-day streak
                    <span className="absolute -bottom-1 left-0 w-full h-px bg-orange-500/50 shadow-[0_0_8px_#F97316]" />
                  </span>.
                </>
              ) : null}
              <br />
              Ready to transform your information into knowledge?
            </p>

            {/* Modernized Buttons */}
            <div className="flex flex-row items-center justify-center gap-5 pt-8 relative z-20 flex-wrap">
              <div className="relative group">
                <div className="absolute -inset-1 bg-gradient-to-r from-orange-600 to-purple-600 rounded-full blur opacity-40 group-hover:opacity-100 transition duration-1000 group-hover:duration-700" />
                <Button
                  size="lg"
                  variant="primary"
                  icon={<Plus size={20} />}
                  onClick={() => navigate('/new')}
                  className="relative !bg-black"
                >
                  New Notebook
                </Button>
              </div>
              <Button
                size="lg"
                variant="glow"
                icon={<Sparkles size={18} />}
                onClick={() => navigate('/discover')}
              >
                Discover Sources
              </Button>
            </div>
          </div>

          {/* Recent Notebooks */}
          <div>
            <div className="flex items-center justify-between mb-6 relative z-20">
              <h2 className="text-xl font-semibold text-white flex items-center gap-2 backdrop-blur-md px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <BookOpen size={20} className="text-memento-purple-400" />
                Jump Back In
              </h2>
              <Link to="/notebooks" className="flex flex-col items-center group cursor-pointer">
                <div className="flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors">
                  <span className="font-medium text-sm">View All Notebooks</span>
                  <ArrowRight size={16} className="text-memento-purple-400 transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </Link>
            </div>

            {isLoadingNotebooks ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 relative z-20">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-52 rounded-2xl bg-white/5 animate-pulse" />
                ))}
              </div>
            ) : recentNotebooks.length === 0 ? (
              <div className="text-center py-12 relative z-20">
                <p className="text-slate-400 mb-4">No notebooks yet. Create your first one!</p>
                <Button
                  variant="primary"
                  icon={<Plus size={18} />}
                  onClick={() => navigate('/new')}
                >
                  Create Notebook
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 relative z-20">
                {recentNotebooks.map((notebook, index) => (
                  <Link
                    to={`/notebook/${notebook.id}`}
                    key={notebook.id}
                    className="block group perspective-1000"
                    style={{ transitionDelay: `${index * 100}ms` }}
                  >
                    <GlassPanel
                      variant="card"
                      intensity="medium"
                      className="h-52 p-6 flex flex-col justify-between relative overflow-hidden transition-all duration-500 group-hover:-translate-y-3 group-hover:rotate-x-2 group-hover:shadow-[0_20px_40px_-15px_rgba(139,92,246,0.3)]"
                    >
                      {/* Dynamic Cover Gradient - Reduced Opacity */}
                      <div
                        className="absolute top-0 left-0 w-full h-1 opacity-50 group-hover:h-full group-hover:opacity-20 transition-all duration-500 ease-out"
                        style={{ backgroundColor: notebook.coverColor }}
                      />

                      <div className="flex justify-between items-start relative z-10">
                        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-200 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-500 shadow-inner backdrop-blur-md" style={{ color: notebook.coverColor }}>
                          <BookOpen size={24} />
                        </div>
                      </div>

                      <div className="relative z-10 transform group-hover:translate-x-1 transition-transform duration-300">
                        <h3 className="text-xl font-display font-semibold text-slate-100 group-hover:text-white mb-2 tracking-tight">{notebook.title}</h3>
                        <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                          <span className="flex items-center gap-1"><Clock size={12} /> {notebook.lastEdited}</span>
                          <span className="opacity-50">|</span>
                          <span>{notebook.sourceCount} sources</span>
                        </div>
                      </div>
                    </GlassPanel>
                  </Link>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
