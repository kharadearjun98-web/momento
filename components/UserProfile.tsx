import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import { getAvatarUrl } from '../lib/avatar';
import { LogOut, User as UserIcon, Settings, Loader2 } from 'lucide-react';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string;
  provider: string;
  created_at: string;
}

export function UserProfile() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          navigate('/signin');
          return;
        }

        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) {
          // If profile doesn't exist, create basic profile from user data
          setProfile({
            id: user.id,
            email: user.email || '',
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
            avatar_url: user.user_metadata?.avatar_url || '',
            provider: user.app_metadata?.provider || 'email',
            created_at: user.created_at,
          });
        } else {
          setProfile(data);
        }
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProfile();
  }, [navigate]);

  const handleSignOut = async () => {
    setShowMenu(false);
    localStorage.removeItem('memento_user_credits');
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    }
    navigate('/signin');
  };

  const handleNavigate = (path: string) => {
    setShowMenu(false);
    navigate(path);
  };

  if (isLoading) {
    return (
      <div className="fixed top-4 right-4 z-50">
        <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
      </div>
    );
  }

  if (!profile) return null;

  const avatarUrl = getAvatarUrl(profile.avatar_url, profile.full_name, profile.email);
  const initials = (profile.full_name || '')
    .split(' ')
    .map(part => part?.[0] || '')
    .join('')
    .toUpperCase()
    .substring(0, 2) || 'U';

  return (
    <div className="relative">
      {/* Profile Button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-200 backdrop-blur-md"
      >
        {imageError ? (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-semibold text-sm border-2 border-purple-400/50">
            {initials}
          </div>
        ) : (
          <img
            src={avatarUrl}
            alt={profile.full_name}
            className="w-8 h-8 rounded-full border-2 border-purple-400/50"
            onError={() => setImageError(true)}
          />
        )}
        <div className="hidden md:block text-left">
          <p className="text-sm font-medium text-white">{profile.full_name}</p>
          <p className="text-xs text-slate-400">{profile.email}</p>
        </div>
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-72 bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
            {/* Profile Header */}
            <div className="p-4 bg-gradient-to-br from-purple-600/20 to-blue-600/20 border-b border-white/10">
              <div className="flex items-center gap-3">
                {imageError ? (
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-semibold text-lg border-2 border-purple-400/50">
                    {initials}
                  </div>
                ) : (
                  <img
                    src={avatarUrl}
                    alt={profile.full_name}
                    className="w-12 h-12 rounded-full border-2 border-purple-400/50"
                    onError={() => setImageError(true)}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{profile.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{profile.email}</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="p-2">
              <button
                onClick={() => handleNavigate('/profile')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left text-slate-300 hover:text-white"
              >
                <UserIcon className="w-4 h-4" />
                <span className="text-sm">View Profile</span>
              </button>
              <button
                onClick={() => handleNavigate('/settings')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors text-left text-slate-300 hover:text-white"
              >
                <Settings className="w-4 h-4" />
                <span className="text-sm">Account Settings</span>
              </button>
              
              <div className="my-2 border-t border-white/10" />
              
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 transition-colors text-left text-red-400 hover:text-red-300"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm">Sign Out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
