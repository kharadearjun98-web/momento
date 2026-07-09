import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase/client';
import { Loader2, AlertCircle } from 'lucide-react';
import { ensureUserHasPlan } from '../../lib/profilePlan';

export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        console.log('=== AUTH CALLBACK STARTED ===');
        console.log('Current URL:', window.location.href);
        console.log('Search params:', window.location.search);
        console.log('Hash:', window.location.hash);
        
        // Supabase automatically handles the OAuth callback
        // Just check if we have a session
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        console.log('Session retrieved:', session);
        console.log('Session error:', sessionError);
        
        if (sessionError) {
          console.error('Error getting session:', sessionError);
          setError(sessionError.message);
          setTimeout(() => navigate('/signin'), 2000);
          return;
        }

        if (!session) {
          console.error('No session found after OAuth callback');
          setError('Authentication failed. Please try again.');
          setTimeout(() => navigate('/signin'), 2000);
          return;
        }

        console.log('Session valid, user:', session.user.email);
        
        await ensureUserHasPlan(session.user);
        console.log('User has plan, redirecting to dashboard...');
        navigate('/', { replace: true });
        
      } catch (err) {
        console.error('Unexpected error in auth callback:', err);
        setError('An unexpected error occurred.');
        setTimeout(() => navigate('/signin'), 2000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0118] via-[#1a0b2e] to-[#0f0520] px-4">
      <div className="text-center space-y-4 max-w-md">
        {error ? (
          <>
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
            <p className="text-red-300">{error}</p>
            <p className="text-gray-400 text-sm">Redirecting to sign in...</p>
          </>
        ) : (
          <>
            <Loader2 className="w-12 h-12 animate-spin text-purple-400 mx-auto" />
            <p className="text-gray-400">Completing sign in...</p>
            <p className="text-gray-500 text-sm">Please wait...</p>
          </>
        )}
      </div>
    </div>
  );
}
