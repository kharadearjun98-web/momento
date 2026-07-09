# 🚀 Memento - February 2026 Release
## Critical Path Checklist

**Deadline:** Early February 2026  
**Last Updated:** January 21, 2026

---

## 📱 Mobile App (Critical)

### Setup & Infrastructure
- [ ] Choose framework: **React Native** (recommended) or Flutter
- [ ] Initialize project scaffold
- [ ] Set up Supabase SDK for mobile
- [ ] Configure environment variables
- [ ] Set up CI/CD for app builds

### Authentication
- [ ] **Apple Sign-In** ⚠️ *REQUIRED for iOS App Store*
- [ ] Google Sign-In
- [ ] Email/Password login
- [ ] Biometric unlock (Face ID / Touch ID)
- [ ] Session persistence

### Core Features (MVP)
- [ ] Notebook list view
- [ ] Notebook detail view
- [ ] Audio playback with background support
- [ ] Flashcard study mode
- [ ] Basic RAG chat
- [ ] Push notifications (generation complete alerts)

### App Store Preparation
- [ ] App icons (all sizes)
- [ ] Screenshots (iPhone, iPad if applicable)
- [ ] App Store description
- [ ] Privacy policy URL
- [ ] Apple Developer account setup
- [ ] TestFlight beta testing
- [ ] App Store review submission

---

## 💳 Payment System

### Stripe Integration
- [ ] Create Stripe account
- [ ] Set up products/prices in Stripe dashboard
- [ ] Implement Stripe Checkout
- [ ] Handle webhook events (subscription created/canceled)
- [ ] Store subscription status in database

### Database Updates
- [ ] Create `subscription_plans` table
- [ ] Create `user_subscriptions` table
- [ ] Add `subscription_tier` to user profile
- [ ] Create usage tracking tables

### Pricing Tiers
- [ ] Define Free tier limits
- [ ] Define Pro tier limits
- [ ] Define Team tier limits (if applicable)
- [ ] Implement limit enforcement logic

### UI Components
- [ ] Pricing page
- [ ] Subscription management page
- [ ] Usage dashboard
- [ ] Upgrade prompts when limits reached

### Credit System (Tier-Based)

#### Database Schema
- [ ] Create `user_credits` table:
  - `id` (UUID, primary key)
  - `user_id` (UUID, FK to users)
  - `tier_id` (UUID, FK to subscription_plans)
  - `balance` (integer, current credits)
  - `monthly_allowance` (integer, from tier config)
  - `bonus_credits` (integer, promotional/purchased)
  - `last_refill_date` (timestamp)
  - `next_refill_date` (timestamp)
  - `created_at`, `updated_at`

- [ ] Create `credit_transactions` table:
  - `id` (UUID, primary key)
  - `user_id` (UUID, FK to users)
  - `type` (enum: 'usage', 'refill', 'purchase', 'bonus', 'refund')
  - `amount` (integer, positive for add, negative for deduct)
  - `feature` (enum: 'audio', 'slides', 'flashcards', 'quiz', 'mindmap', 'chat', 'video')
  - `description` (text, e.g., "Generated audio overview for Notebook X")
  - `balance_after` (integer, for audit trail)
  - `created_at`

#### Monthly Credit Allowances by Tier
| Tier | Monthly Credits | Rollover | Bonus Credits |
|------|----------------|----------|---------------|
| **Free** | 50 credits/month | ❌ No rollover | None |
| **Pro** ($9.99/mo) | 500 credits/month | ✅ Up to 200 rollover | +50 signup bonus |
| **Team** ($24.99/mo) | 2,000 credits/month | ✅ Up to 1,000 rollover | +200 signup bonus |

#### Credit Costs per Feature
| Feature | Credit Cost | Notes |
|---------|-------------|-------|
| **Audio Overview** | 10 credits | Per generation (~5-10 min audio) |
| **Slide Deck** | 8 credits | Per deck (10-15 slides) |
| **Flashcard Set** | 3 credits | Per set generation |
| **Quiz Generation** | 3 credits | Per quiz (10-20 questions) |
| **Mind Map** | 5 credits | Per mind map |
| **RAG Chat Message** | 1 credit | Per AI response |
| **Video Generation** | 25 credits | Future feature (high cost) |
| **Document Processing** | 2 credits | Per PDF/document upload & indexing |

#### Implementation Tasks
- [ ] Implement credit deduction logic (validate balance before action)
- [ ] Block feature if insufficient credits (show upgrade prompt)
- [ ] Auto-refill credits at midnight on billing cycle date
- [ ] Handle rollover calculation (cap at tier limit)
- [ ] Credit balance display in navbar with tier badge icon
- [ ] Real-time balance updates after each action
- [ ] Low credit warning at 20% remaining (toast notification)
- [ ] Critical warning at 10% remaining (modal with upgrade CTA)

#### Credit Purchase Options (Top-ups)
| Pack | Credits | Price | Discount |
|------|---------|-------|----------|
| Starter Pack | 100 credits | $4.99 | - |
| Value Pack | 300 credits | $9.99 | 33% savings |
| Power Pack | 1,000 credits | $24.99 | 50% savings |

- [ ] Credit purchase UI (in settings + low credit modal)
- [ ] One-time Stripe checkout for credit packs
- [ ] Credits never expire (purchased credits)
- [ ] Separate tracking: subscription credits vs purchased credits

#### Admin Dashboard
- [ ] View user credit balances and history
- [ ] Manually adjust credits (with audit log)
- [ ] Grant promotional/bonus credits
- [ ] View aggregate usage statistics by feature
- [ ] Set credit costs per feature (config table)

### Additional Payment Methods
- [ ] PayPal integration
- [ ] Apple In-App Purchase (for mobile)
- [ ] Google Play Billing (for mobile)

---

## 🔐 Authentication Improvements

### New Login Methods
- [ ] Apple Sign-In (web + mobile)
- [ ] Improve Google OAuth reliability
- [ ] Magic link option (optional)

### UI/UX Improvements
- [ ] Redesign login page
- [ ] Redesign signup page
- [ ] Better error messaging
- [ ] Password strength indicator
- [ ] Email verification flow

---

## 🎨 Slides Quality Fixes

- [ ] Improve slide template designs
- [ ] Fix text sizing issues
- [ ] Better image generation/selection
- [ ] Add content validation before slide creation
- [ ] Template variety/selection

---

## 🧪 Testing & Validation

- [ ] Test with 10+ different PDFs
- [ ] Test with various document types (URLs, text files)
- [ ] Test research/discover sources functionality
- [ ] Test all generation types work correctly
- [ ] Performance testing on large documents
- [ ] Cross-browser testing (Chrome, Safari, Firefox)

---

## 📋 Week-by-Week Plan

### Week 1 (Jan 21-27)
- [ ] Mobile app scaffold created
- [ ] Apple Sign-In implemented (web)
- [ ] Stripe account & products configured
- [ ] Slide quality fixes started

### Week 2 (Jan 28 - Feb 3)
- [ ] Mobile auth complete
- [ ] Mobile notebook views complete
- [ ] Stripe Checkout working
- [ ] Payment webhooks handling

### Week 3 (Feb 4-10)
- [ ] Mobile audio playback complete
- [ ] Mobile flashcards complete
- [ ] Pricing page UI complete
- [ ] Testing with multiple documents

### Week 4 (Feb 11-17)
- [ ] Mobile polish & bug fixes
- [ ] TestFlight beta release
- [ ] App Store assets prepared
- [ ] Final testing pass

### Week 5 (Feb 18-24)
- [ ] App Store submission
- [ ] Address any Apple review feedback
- [ ] Launch preparation
- [ ] **🎉 RELEASE**

---

## ⏳ Deferred to Future Releases

*These are NOT part of February release:*

- Voice cloning integration
- AI Debate Room / Podcast Studio with avatars
- Documentary Mode
- Reality Mode (Immersive Tutor)
- Course Builder
- Habit Tracker / Gamification UI
- Advanced Discovery Engine
- Team collaboration features
- SSO / Enterprise features
- Multi-language support

---

## 🎯 Success Criteria for February

1. ✅ Mobile app live on App Store
2. ✅ Users can subscribe to paid plans
3. ✅ Usage limits enforced per tier
4. ✅ Slides generate with quality text/images
5. ✅ All core features tested and stable
