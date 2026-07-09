import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase/client';
import { useNotification } from '../lib/useNotification';
import { saveUserPlan } from '../lib/profilePlan';

interface PlanFeature {
  text: string;
  subtext: string;
  included: boolean;
}

interface Plan {
  id: string;
  name: string;
  price: string;
  priceSubtext: string;
  features: PlanFeature[];
  buttonText: string;
  isPopular?: boolean;
  buttonVariant: 'default' | 'primary';
}

const plans: Plan[] = [
  {
    id: 'free',
    name: 'Free',
    price: 'Free',
    priceSubtext: '',
    features: [
      { text: '50 credits', subtext: 'Monthly credits', included: true },
      { text: 'No rollover', subtext: 'Credit rollover', included: false },
      { text: 'No bonus', subtext: 'Signup bonus', included: false },
    ],
    buttonText: 'Get Started',
    buttonVariant: 'default',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '$9.99',
    priceSubtext: '/month',
    features: [
      { text: '500 credits', subtext: 'Monthly credits', included: true },
      { text: 'Up to 200 credits rollover', subtext: 'Credit rollover', included: true },
      { text: '+50 signup bonus', subtext: 'Signup bonus', included: true },
    ],
    buttonText: 'Start Free Trial',
    isPopular: true,
    buttonVariant: 'primary',
  },
  {
    id: 'team',
    name: 'Team',
    price: '$24.99',
    priceSubtext: '/month',
    features: [
      { text: '2,000 credits', subtext: 'Monthly credits', included: true },
      { text: 'Up to 1,000 credits rollover', subtext: 'Credit rollover', included: true },
      { text: '+200 signup bonus', subtext: 'Signup bonus', included: true },
    ],
    buttonText: 'Start Free Trial',
    buttonVariant: 'default',
  },
];

export function ChoosePlan() {
  const navigate = useNavigate();
  const notification = useNotification();
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectPlan = async (planId: string) => {
    setSelectedPlan(planId);
    setIsLoading(true);

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      
      if (userError || !user) {
        notification.error('Sign In Required', 'Please sign in to select a plan');
        navigate('/signin');
        return;
      }

      const preferences = await saveUserPlan(user, planId);
      const totalCredits = preferences.credits;
      console.log('Profile updated successfully with credits:', totalCredits);

      // Also save to localStorage as backup for immediate display
      localStorage.setItem('memento_user_credits', totalCredits.toString());

      // Show success message
      if (planId === 'free') {
        notification.success('Welcome!', `You have ${totalCredits} credits to start.`);
      } else {
        notification.success('Trial Started', `Free trial started! You have ${totalCredits} credits.`);
      }

      // Navigate to dashboard
      navigate('/');
      
    } catch (error) {
      console.error('Error selecting plan:', error);
      notification.error('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
      setSelectedPlan(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6 py-8 overflow-auto"
      style={{
        background: 'linear-gradient(180deg, #1a0b2e 0%, #2d1b4e 50%, #0f0a1f 100%)',
      }}
    >
      {/* Header */}
      <div className="text-center mb-10 max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
          Choose Your Plan
        </h1>
        <p className="text-slate-300 text-base md:text-lg leading-relaxed">
          Start with a free plan and upgrade as you grow. All paid plans come with a free trial
          and flexible credit rollover to maximize your value.
        </p>
      </div>

      {/* Pricing Cards - Horizontal Layout */}
      <div className="flex flex-row gap-6 items-stretch justify-center w-full max-w-5xl">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`relative flex-1 max-w-[320px] min-w-[280px] rounded-2xl p-6 flex flex-col transition-all duration-300 ${
              plan.isPopular
                ? 'border-2 border-[#10d9a0] bg-white/[0.08]'
                : 'border border-white/10 bg-white/[0.04]'
            } backdrop-blur-xl hover:bg-white/[0.08] hover:border-white/20`}
            style={{
              boxShadow: plan.isPopular
                ? '0 0 40px rgba(16, 217, 160, 0.15)'
                : '0 4px 24px rgba(0, 0, 0, 0.2)',
            }}
          >
            {/* Most Popular Badge */}
            {plan.isPopular && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1 rounded-full text-sm font-medium bg-[#10d9a0] text-[#0f0a1f]">
                  Most Popular
                </span>
              </div>
            )}

            {/* Plan Name */}
            <h3 className="text-lg font-medium text-white mb-3 mt-2">
              {plan.name}
            </h3>

            {/* Price */}
            <div className="mb-5">
              <span className="text-4xl font-bold text-white">{plan.price}</span>
              {plan.priceSubtext && (
                <span className="text-slate-400 text-lg">{plan.priceSubtext}</span>
              )}
            </div>

            {/* Features */}
            <div className="space-y-3 mb-6 flex-grow">
              {plan.features.map((feature, index) => (
                <div key={index} className="flex items-start gap-3">
                  {feature.included ? (
                    <div className="w-5 h-5 rounded-full bg-[#10d9a0]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-[#10d9a0]" />
                    </div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <X className="w-3 h-3 text-slate-500" />
                    </div>
                  )}
                  <div>
                    <p className={`text-sm font-medium ${feature.included ? 'text-white' : 'text-slate-400'}`}>
                      {feature.text}
                    </p>
                    <p className="text-xs text-slate-500">{feature.subtext}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* CTA Button - Always at bottom */}
            <button
              onClick={() => handleSelectPlan(plan.id)}
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 flex items-center justify-center gap-2 mt-auto ${
                plan.buttonVariant === 'primary'
                  ? 'bg-[#10d9a0] hover:bg-[#0fc08d] text-[#0f0a1f]'
                  : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading && selectedPlan === plan.id ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  {plan.isPopular && <Sparkles className="w-4 h-4" />}
                  {plan.buttonText}
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {/* Footer Note */}
      <p className="text-slate-500 text-sm mt-8 text-center">
        You can change your plan anytime from your account settings.
      </p>
    </div>
  );
}

export default ChoosePlan;
