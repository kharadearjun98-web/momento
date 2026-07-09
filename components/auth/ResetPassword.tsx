import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  resetPasswordSchema,
  verifyOtpSchema,
  newPasswordSchema,
  type ResetPasswordFormData,
  type VerifyOtpFormData,
  type NewPasswordFormData,
} from '../../lib/validations';
import { supabase } from '../../lib/supabase/client';
import { getErrorMessage } from '../../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle, ArrowLeft, Eye, EyeOff, Mail, Lock } from 'lucide-react';

type Step = 'email' | 'verify' | 'newPassword';

export function ResetPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const emailForm = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const otpForm = useForm<VerifyOtpFormData>({
    resolver: zodResolver(verifyOtpSchema),
  });

  const passwordForm = useForm<NewPasswordFormData>({
    resolver: zodResolver(newPasswordSchema),
  });

  const onEmailSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const normalizedEmail = data.email.trim().toLowerCase();
      const { error: functionError } = await supabase.functions.invoke('request-reset-code', {
        body: { email: normalizedEmail },
      });

      if (functionError) {
        throw new Error('Failed to send reset code. Please try again later.');
      }

      setEmail(normalizedEmail);
      setCode('');
      otpForm.reset();
      passwordForm.reset();
      setSuccess(`If an account exists for ${normalizedEmail}, a password reset code has been sent.`);
      setTimeout(() => {
        setStep('verify');
        setSuccess('');
      }, 1500);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const onOtpSubmit = async (data: VerifyOtpFormData) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      setCode(data.code.trim());
      setSuccess('Code saved. Now create your new password.');
      setTimeout(() => {
        setStep('newPassword');
        setSuccess('');
      }, 750);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const onPasswordSubmit = async (data: NewPasswordFormData) => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error: functionError } = await supabase.functions.invoke('reset-password', {
        body: {
          email,
          code,
          newPassword: data.password,
        },
      });

      if (functionError) {
        throw new Error('Invalid or expired code. Please request a new code and try again.');
      }

      setSuccess('Password updated successfully. Redirecting to sign in...');
      setTimeout(() => {
        navigate('/signin');
      }, 2000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  const resendCode = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      const { error: functionError } = await supabase.functions.invoke('request-reset-code', {
        body: { email },
      });

      if (functionError) {
        throw new Error('Failed to send reset code. Please try again later.');
      }

      setCode('');
      otpForm.reset();
      passwordForm.reset();
      setSuccess('If an account exists for that email, a new code has been sent.');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0118] via-[#1a0b2e] to-[#0f0520] px-4 py-8">
      <div className="w-full max-w-md">
        <div className="bg-[#1a1625]/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-purple-500/20 p-8 space-y-6">
          <Link
            to="/signin"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>

          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
              {step === 'email' && 'Reset Password'}
              {step === 'verify' && 'Verify Code'}
              {step === 'newPassword' && 'New Password'}
            </h1>
            <p className="text-gray-400 text-sm">
              {step === 'email' && 'Enter your email to receive a verification code'}
              {step === 'verify' && 'Enter the 6-digit code sent to your email'}
              {step === 'newPassword' && 'Create your new password'}
            </p>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-green-300">{success}</p>
            </div>
          )}

          {step === 'email' && (
            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="block text-sm font-medium text-gray-200">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...emailForm.register('email')}
                    type="email"
                    id="email"
                    className="w-full pl-11 pr-4 py-3 bg-[#0f0a1a]/90 border border-white/15 rounded-lg focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 text-white placeholder-gray-400 transition-all duration-200 outline-none hover:border-white/25"
                    placeholder="you@example.com"
                  />
                </div>
                {emailForm.formState.errors.email && (
                  <p className="text-sm text-red-400">{emailForm.formState.errors.email.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-3 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/20"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Sending code...
                  </span>
                ) : (
                  'Send Verification Code'
                )}
              </button>
            </form>
          )}

          {step === 'verify' && (
            <form onSubmit={otpForm.handleSubmit(onOtpSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="code" className="block text-sm font-medium text-gray-200">
                  Verification Code
                </label>
                <input
                  {...otpForm.register('code')}
                  type="text"
                  id="code"
                  maxLength={6}
                  className="w-full px-4 py-3 bg-[#0f0a1a]/90 border border-white/15 rounded-lg focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 text-white placeholder-gray-400 text-center text-2xl tracking-widest font-mono transition-all duration-200 outline-none hover:border-white/25"
                  placeholder="000000"
                />
                {otpForm.formState.errors.code && (
                  <p className="text-sm text-red-400">{otpForm.formState.errors.code.message}</p>
                )}
                <p className="text-xs text-gray-400 text-center">
                  Code sent to <span className="text-purple-400">{email}</span>
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-3 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/20"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </span>
                ) : (
                  'Continue'
                )}
              </button>

              <button
                type="button"
                onClick={resendCode}
                disabled={isLoading}
                className="w-full text-sm text-purple-400 hover:text-purple-300 transition-colors disabled:opacity-50"
              >
                Did not receive the code? Resend
              </button>
            </form>
          )}

          {step === 'newPassword' && (
            <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="password" className="block text-sm font-medium text-gray-200">
                  New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...passwordForm.register('password')}
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    className="w-full pl-11 pr-12 py-3 bg-[#0f0a1a]/90 border border-white/15 rounded-lg focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 text-white placeholder-gray-400 transition-all duration-200 outline-none hover:border-white/25"
                    placeholder="Enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {passwordForm.formState.errors.password && (
                  <p className="text-sm text-red-400">{passwordForm.formState.errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-200">
                  Confirm New Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    {...passwordForm.register('confirmPassword')}
                    type={showConfirmPassword ? 'text' : 'password'}
                    id="confirmPassword"
                    className="w-full pl-11 pr-12 py-3 bg-[#0f0a1a]/90 border border-white/15 rounded-lg focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 text-white placeholder-gray-400 transition-all duration-200 outline-none hover:border-white/25"
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300 transition-colors"
                    aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                  >
                    {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                {passwordForm.formState.errors.confirmPassword && (
                  <p className="text-sm text-red-400">{passwordForm.formState.errors.confirmPassword.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-4 py-3 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-purple-500/20"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Updating password...
                  </span>
                ) : (
                  'Reset Password'
                )}
              </button>
            </form>
          )}

          <div className="text-center">
            <p className="text-gray-400 text-sm">
              Do not have an account?{' '}
              <Link
                to="/signup"
                className="text-purple-400 hover:text-purple-300 font-medium transition-colors"
              >
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
