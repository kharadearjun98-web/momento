import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase/client';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const checkAuth = async () => {
      console.log('ProtectedRoute: Checking authentication...');
      console.log('ProtectedRoute: Start time:', new Date().toISOString());
      
      // Add a shorter timeout to prevent infinite loading
      const timeout = setTimeout(() => {
        console.error('ProtectedRoute: Auth check timed out after 5 seconds');
        if (isMounted) {
          setIsLoading(false);
          setIsAuthenticated(false);
        }
      }, 5000);
      
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        clearTimeout(timeout);
        
        if (error) {
          console.error('ProtectedRoute: Error getting session:', error);
        }
        
        console.log('ProtectedRoute: Session:', session ? {
          user: session.user.email,
          expires: session.expires_at
        } : 'Not found');
        
        if (isMounted) {
          setIsAuthenticated(!!session);
          setIsLoading(false);
        }
      } catch (err) {
        clearTimeout(timeout);
        console.error('ProtectedRoute: Exception during auth check:', err);
        if (isMounted) {
          setIsAuthenticated(false);
          setIsLoading(false);
        }
      }
    };

    checkAuth();

    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        console.log('ProtectedRoute: Auth state changed:', event);
        console.log('ProtectedRoute: Session after change:', session ? 'Exists' : 'None');
        if (isMounted) {
          setIsAuthenticated(!!session);
          setIsLoading(false);
        }
      });
      subscription = data.subscription;
    } catch (err) {
      console.error('ProtectedRoute: Failed to set up auth listener:', err);
    }

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0a0118' }}>
        <Loader2 className="w-12 h-12 animate-spin text-purple-400" />
        <p className="text-slate-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    console.log('ProtectedRoute: User not authenticated, redirecting to /signin');
    return <Navigate to="/signin" replace />;
  }

  console.log('ProtectedRoute: User authenticated, rendering protected content');

  return <>{children}</>;
}
