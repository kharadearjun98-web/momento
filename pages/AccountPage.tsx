import React, { useEffect, useState } from 'react';
import { Mail, Settings, Shield, User } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { getAvatarUrl } from '../lib/avatar';

interface AccountPageProps {
  view: 'profile' | 'settings';
}

interface AccountProfile {
  email: string;
  full_name: string;
  avatar_url: string;
  provider: string;
  created_at: string;
}

export const AccountPage: React.FC<AccountPageProps> = ({ view }) => {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from('profiles')
        .select('email, full_name, avatar_url, provider, created_at')
        .eq('id', user.id)
        .maybeSingle();

      setProfile({
        email: data?.email || user.email || '',
        full_name: data?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        avatar_url: data?.avatar_url || user.user_metadata?.avatar_url || '',
        provider: data?.provider || user.app_metadata?.provider || 'email',
        created_at: data?.created_at || user.created_at,
      });
      setIsLoading(false);
    };

    fetchProfile();
  }, []);

  if (isLoading) {
    return <div className="p-8 text-slate-400">Loading account...</div>;
  }

  if (!profile) {
    return <div className="p-8 text-slate-400">No account profile found.</div>;
  }

  const avatarUrl = getAvatarUrl(profile.avatar_url, profile.full_name, profile.email);
  const createdAt = profile.created_at ? new Date(profile.created_at).toLocaleDateString() : 'Unknown';

  return (
    <div className="h-full overflow-y-auto custom-scrollbar p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-display font-bold text-white">
            {view === 'profile' ? 'Profile' : 'Account Settings'}
          </h1>
          <p className="text-slate-400 mt-2">
            {view === 'profile' ? 'Your Memento account details.' : 'Manage account and security settings.'}
          </p>
        </div>

        <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <div className="flex items-center gap-5">
            <img
              src={avatarUrl}
              alt={profile.full_name}
              className="w-16 h-16 rounded-full border-2 border-purple-400/50"
            />
            <div className="min-w-0">
              <h2 className="text-2xl font-semibold text-white truncate">{profile.full_name}</h2>
              <p className="text-slate-400 truncate">{profile.email}</p>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-3 text-slate-300">
              <Mail size={18} className="text-purple-300" />
              <span className="font-medium">Email</span>
            </div>
            <p className="text-white mt-3 break-all">{profile.email}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-3 text-slate-300">
              <Shield size={18} className="text-purple-300" />
              <span className="font-medium">Sign-in provider</span>
            </div>
            <p className="text-white mt-3 capitalize">{profile.provider}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-3 text-slate-300">
              <User size={18} className="text-purple-300" />
              <span className="font-medium">Member since</span>
            </div>
            <p className="text-white mt-3">{createdAt}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center gap-3 text-slate-300">
              <Settings size={18} className="text-purple-300" />
              <span className="font-medium">Settings</span>
            </div>
            <p className="text-slate-400 mt-3">Billing and profile editing controls can be added here.</p>
          </div>
        </section>
      </div>
    </div>
  );
};
