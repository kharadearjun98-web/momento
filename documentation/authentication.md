# Authentication System

This document outlines the planned authentication architecture for Memento, leveraging **Convex Auth** for a secure and scalable user management system.

## Overview

The authentication flow is designed to be seamless, supporting both traditional email/password logins and modern OAuth providers. It integrates directly with the backend database to manage user profiles, preferences, and secure access to notebooks.

### Workflow Stages
1.  **Sign Up/In**: Dedicated pages for user registration and login.
2.  **Profile Setup**: Post-registration flow to set up user details (name, avatar).
3.  **Database Initialization**: Once auth is secured, user-specific database records (notebooks, etc.) are initialized.

## Technology Stack

### Primary Authentication System
- **@convex-dev/auth**: The core library for handling authentication logic, session management, and security, tightly integrated with the Convex backend.

### Authentication Methods

#### 1. Email/Password
- **Provider**: `@convex-dev/auth/providers/Password`
- **Implementation**:
    - Uses `react-hook-form` for form state management.
    - Uses `zod` for robust schema validation (email format, password strength).
    - **Sign Up Fields**: First Name, Last Name, Email, Password.
    - **Sign In Fields**: Email, Password.

#### 2. OAuth Providers
- **Google OAuth**:
    - Provider: `@auth/core/providers/google`
    - Status: Planned for primary social login.
- **Microsoft OAuth**:
    - Provider: Microsoft Entra ID (formerly Azure AD).
    - Status: UI button present; implementation details to be finalized.

## Additional Technologies

- **Form Management**: `react-hook-form` combined with `@hookform/resolvers/zod` for seamless validation integration.
- **Validation**: `zod` schemas to ensure data integrity before it reaches the backend.
- **Middleware**: `@convex-dev/auth/nextjs/server` for protecting routes (e.g., redirecting unauthenticated users from `/dashboard` to `/auth/sign-in`).
- **Client Hooks**: `@convex-dev/auth/react` for handling auth actions (login, logout, user data fetching) within React components.

## User Profile Management

Once authenticated, users will have access to a Profile Page to manage their identity:
- **Password Change**: Secure flow to update credentials.
- **Name Change**: Update First and Last names.
- **Profile Picture**: Upload and management of user avatars (stored in Supabase Storage `avatars` bucket).

## User Storage

**Location**: Users are stored in the **Convex Database** in the `users` table.
- This table is automatically managed by the `@convex-dev/auth` library.
- It serves as the single source of truth for user identity.
- **Schema**:
    - `name`: String (optional)
    - `email`: String (optional)
    - `image`: String (optional URL)
    - `emailVerificationTime`: Number (optional timestamp)
    - OAuth provider links (e.g., Google ID, Microsoft ID).

## Integration with Database

Authentication is the gateway to the rest of the application.
- **User ID**: The unique `_id` from the Convex `users` table is used as the reference for all user-owned resources (Notebooks, Conversations, etc.).
- **Data Consistency**: If using a separate database (e.g., Supabase) for application data, this Convex User ID must be synchronized or used as the foreign key.
