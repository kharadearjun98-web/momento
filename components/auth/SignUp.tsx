import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema, type SignUpFormData } from '../../lib/validations';
import { supabase } from '../../lib/supabase/client';
import { getErrorMessage } from '../../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, Eye, EyeOff, ArrowRight } from 'lucide-react';
import { AuthLayout } from './AuthLayout';

// Google icon component
const GoogleIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// Apple icon component
const AppleIcon = () => (
  <svg className="h-5 w-5 text-white" fill="currentColor" viewBox="0 0 24 24">
    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
  </svg>
);

// Password strength calculator
function getPasswordStrength(password: string): { level: number; label: string; color: string } {
  if (!password) return { level: 0, label: '', color: '' };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return { level: 1, label: 'Weak', color: 'bg-red-500' };
  if (score <= 2) return { level: 2, label: 'Fair', color: 'bg-yellow-500' };
  if (score <= 3) return { level: 3, label: 'Good', color: 'bg-green-500' };
  return { level: 4, label: 'Strong', color: 'bg-emerald-500' };
}

export function SignUp() {
  const navigate = useNavigate();
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
  });

  const fullNameValue = watch('fullName', '');
  const emailValue = watch('email', '');
  const password = watch('password', '');
  const confirmPassword = watch('confirmPassword', '');
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const onSubmit = async (data: SignUpFormData) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.fullName },
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });

      if (error) {
        throw error;
      }

      if (authData.session) {
        setSuccess('Account created successfully! Redirecting...');
        await new Promise(resolve => setTimeout(resolve, 500));
        navigate('/choose-plan', { replace: true });
      } else if (authData.user && !authData.session) {
        setSuccess('Account created! Please check your email to verify your account.');
        setTimeout(() => navigate('/signin'), 4000);
      } else {
        setError('Account creation failed. Please try again.');
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setIsLoading(false);
    }
  };

  const onInvalid = () => {
    setError('Please fix the highlighted fields and try again.');
  };

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (error) throw error;
    } catch (err) {
      const errorMessage = getErrorMessage(err);
      if (errorMessage.includes('Provider') || errorMessage.includes('not enabled')) {
        setError('Google sign-in is not configured yet. Please use email/password.');
      } else {
        setError(errorMessage);
      }
      setIsGoogleLoading(false);
    }
  };

  return (
    <AuthLayout>
      {/* Glass card form container */}
      <div className="glass-card rounded-2xl p-6 md:p-10 border border-white/5 bg-white/[0.02]">
        {/* OAuth buttons */}
        <div className="flex flex-col gap-4 mb-8">
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={isGoogleLoading || isLoading}
            className="btn-social relative flex h-14 w-full items-center justify-center gap-3 rounded-xl group disabled:opacity-50"
          >
            {isGoogleLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            <span className="text-sm font-semibold text-white group-hover:text-white font-display">
              Continue with Google
            </span>
          </button>

          <button
            type="button"
            disabled={isLoading}
            className="btn-social relative flex h-14 w-full items-center justify-center gap-3 rounded-xl group disabled:opacity-50"
          >
            <AppleIcon />
            <span className="text-sm font-semibold text-white font-display">
              Continue with Apple
            </span>
          </button>
        </div>

        {/* Divider */}
        <div className="relative flex items-center py-2 mb-8">
          <div className="flex-grow border-t border-white/15" />
          <span className="flex-shrink-0 mx-4 text-xs text-gray-400 font-medium uppercase tracking-wider font-display">
            Or register with email
          </span>
          <div className="flex-grow border-t border-white/15" />
        </div>

        {/* Error/Success alerts */}
        {error && (
          <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}
        {success && (
          <div className="mb-6 bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-300">{success}</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="flex flex-col gap-6">
          {/* Full Name */}
          <div className="relative group">
            <input
              {...register('fullName')}
              type="text"
              id="fullname"
              autoComplete="name"
              placeholder=" "
              data-filled={Boolean(fullNameValue)}
              className="floating-input block px-4 pb-2.5 pt-5 w-full text-base text-white bg-[#1e1625]/80 rounded-xl border border-white/15 appearance-none focus:outline-none focus:ring-0 focus:border-purple-400 focus:bg-[#1e1625]/95 peer placeholder-transparent transition-all group-hover:border-white/25"
            />
            <label
              htmlFor="fullname"
              className="floating-label absolute text-xs text-purple-400 duration-200 top-1 z-10 origin-[0] left-4 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-[1.1rem] peer-focus:top-1 peer-focus:text-xs peer-focus:text-purple-400 font-medium"
            >
              Full Name
            </label>
            {errors.fullName && (
              <p className="mt-1 text-sm text-red-400">{errors.fullName.message}</p>
            )}
          </div>

          {/* Email */}
          <div className="relative group">
            <input
              {...register('email')}
              type="email"
              id="email"
              autoComplete="email"
              placeholder=" "
              data-filled={Boolean(emailValue)}
              className="floating-input block px-4 pb-2.5 pt-5 w-full text-base text-white bg-[#1e1625]/80 rounded-xl border border-white/15 appearance-none focus:outline-none focus:ring-0 focus:border-purple-400 focus:bg-[#1e1625]/95 peer placeholder-transparent transition-all group-hover:border-white/25"
            />
            <label
              htmlFor="email"
              className="floating-label absolute text-xs text-purple-400 duration-200 top-1 z-10 origin-[0] left-4 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-[1.1rem] peer-focus:top-1 peer-focus:text-xs peer-focus:text-purple-400 font-medium"
            >
              Work Email
            </label>
            {errors.email && (
              <p className="mt-1 text-sm text-red-400">{errors.email.message}</p>
            )}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-2">
            <div className="relative group">
              <input
                {...register('password')}
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete="new-password"
                placeholder=" "
                data-filled={Boolean(password)}
                className="floating-input block px-4 pb-2.5 pt-5 w-full text-base text-white bg-[#1e1625]/80 rounded-xl border border-white/15 appearance-none focus:outline-none focus:ring-0 focus:border-purple-400 focus:bg-[#1e1625]/95 peer placeholder-transparent transition-all pr-12 group-hover:border-white/25"
              />
              <label
                htmlFor="password"
                className="floating-label absolute text-xs text-purple-400 duration-200 top-1 z-10 origin-[0] left-4 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-[1.1rem] peer-focus:top-1 peer-focus:text-xs peer-focus:text-purple-400 font-medium"
              >
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-5 text-gray-400 hover:text-white transition-colors p-1"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Password strength indicator */}
            {password && (
              <div className="flex flex-col gap-2 px-1 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-400 font-display">
                    Password Strength
                  </span>
                  <span
                    className={`text-xs font-medium font-display ${passwordStrength.level <= 1
                      ? 'text-red-500'
                      : passwordStrength.level === 2
                        ? 'text-yellow-500'
                        : 'text-green-500'
                      }`}
                  >
                    {passwordStrength.label}
                  </span>
                </div>
                <div className="flex gap-1.5 h-1.5 w-full">
                  {[1, 2, 3, 4].map(level => (
                    <div
                      key={level}
                      className={`h-full w-1/4 rounded-full transition-all ${level <= passwordStrength.level
                        ? `${passwordStrength.color} shadow-[0_0_10px_rgba(0,0,0,0.4)]`
                        : 'bg-white/10'
                        }`}
                    />
                  ))}
                </div>
              </div>
            )}
            {errors.password && (
              <p className="mt-1 text-sm text-red-400">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm Password */}
          <div className="relative group">
            <input
              {...register('confirmPassword')}
              type={showConfirmPassword ? 'text' : 'password'}
              id="confirmPassword"
              autoComplete="new-password"
              placeholder=" "
              data-filled={Boolean(confirmPassword)}
              className="floating-input block px-4 pb-2.5 pt-5 w-full text-base text-white bg-[#1e1625]/80 rounded-xl border border-white/15 appearance-none focus:outline-none focus:ring-0 focus:border-purple-400 focus:bg-[#1e1625]/95 peer placeholder-transparent transition-all pr-12 group-hover:border-white/25"
            />
            <label
              htmlFor="confirmPassword"
              className="floating-label absolute text-xs text-purple-400 duration-200 top-1 z-10 origin-[0] left-4 peer-placeholder-shown:text-sm peer-placeholder-shown:text-gray-400 peer-placeholder-shown:top-[1.1rem] peer-focus:top-1 peer-focus:text-xs peer-focus:text-purple-400 font-medium"
            >
              Confirm Password
            </label>
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-5 text-gray-400 hover:text-white transition-colors p-1"
              aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
            {errors.confirmPassword && (
              <p className="mt-1 text-sm text-red-400">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="btn-primary-glow mt-4 flex h-14 w-full items-center justify-center overflow-hidden rounded-xl text-white text-base font-bold font-display disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Creating account...
              </span>
            ) : (
              <>
                Get Started
                <ArrowRight className="ml-2 w-5 h-5" />
              </>
            )}
          </button>
        </form>

        {/* Sign in link */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-400">
            Already a member?{' '}
            <Link
              to="/signin"
              className="font-semibold text-white hover:text-purple-400 transition-colors font-display"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}

export default SignUp;
