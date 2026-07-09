import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';

export function AuthDebug() {
  const [session, setSession] = useState<any>(null);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state change:', event);
      setSession(session);
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    console.log('Current session:', session);
    setSession(session);
    setUser(session?.user || null);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    checkAuth();
  };

  return (
    <div className="fixed bottom-4 right-4 bg-black/90 text-white p-4 rounded-lg text-xs font-mono max-w-sm z-50 border border-purple-500/50">
      <div className="font-bold mb-2 text-purple-400">🔐 Auth Debug</div>
      <div className="space-y-1">
        <div>Status: {session ? '✅ Signed In' : '❌ Signed Out'}</div>
        {user && (
          <>
            <div>Email: {user.email}</div>
            <div>ID: {user.id?.substring(0, 8)}...</div>
            <div>Provider: {user.app_metadata?.provider || 'email'}</div>
          </>
        )}
      </div>
      <div className="mt-3 flex gap-2">
        <button 
          onClick={checkAuth}
          className="px-2 py-1 bg-purple-600 hover:bg-purple-700 rounded text-xs"
        >
          Refresh
        </button>
        {session && (
          <button 
            onClick={signOut}
            className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-xs"
          >
            Sign Out
          </button>
        )}
      </div>
    </div>
  );
}
