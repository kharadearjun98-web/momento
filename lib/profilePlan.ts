import type { User } from '@supabase/supabase-js';
import { supabase } from './supabase/client';

export interface PlanPreferences {
  plan: string;
  credits: number;
  monthly_credits: number;
  max_rollover: number;
  plan_selected_at: string;
  trial_ends_at: string | null;
}

export function buildPlanPreferences(
  planId: string,
  existingPreferences: Record<string, unknown> = {},
): PlanPreferences & Record<string, unknown> {
  let monthlyCredits = 50;
  let signupBonus = 0;
  let maxRollover = 0;

  switch (planId) {
    case 'pro':
      monthlyCredits = 500;
      signupBonus = 50;
      maxRollover = 200;
      break;
    case 'team':
      monthlyCredits = 2000;
      signupBonus = 200;
      maxRollover = 1000;
      break;
    default:
      monthlyCredits = 50;
  }

  return {
    ...existingPreferences,
    plan: planId,
    credits: monthlyCredits + signupBonus,
    monthly_credits: monthlyCredits,
    max_rollover: maxRollover,
    plan_selected_at: new Date().toISOString(),
    trial_ends_at: planId !== 'free'
      ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null,
  };
}

export async function getProfilePreferences(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.preferences ?? null;
}

export async function saveUserPlan(user: User, planId: string) {
  const existingPreferences = await getProfilePreferences(user.id);
  const preferences = buildPlanPreferences(
    planId,
    existingPreferences && typeof existingPreferences === 'object'
      ? existingPreferences as Record<string, unknown>
      : {},
  );

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null,
      provider: user.app_metadata?.provider ?? null,
      preferences,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) {
    throw error;
  }

  return preferences;
}

export async function ensureUserHasPlan(user: User) {
  const preferences = await getProfilePreferences(user.id);
  const plan = preferences?.plan;

  if (plan) {
    return { plan, preferences };
  }

  const repairedPreferences = await saveUserPlan(user, 'free');
  return { plan: repairedPreferences.plan, preferences: repairedPreferences };
}
