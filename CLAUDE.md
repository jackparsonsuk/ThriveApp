# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Structure

The repo root contains a single `thriveapp/` directory — the actual Expo/React Native app. All development work happens inside `thriveapp/`.

Firebase Cloud Functions live in `thriveapp/functions/` and are a separate Node.js project with their own `package.json`.

## Commands

All commands run from `thriveapp/` unless noted.

```bash
# Install app dependencies
npm install

# Install Cloud Functions dependencies
cd functions && npm install

# Start development server (launches Metro Bundler)
npm start

# Platform-specific start
npm run android
npm run ios
npm run web

# Lint
npm run lint

# Start Firebase emulators (for local development)
npx firebase-tools emulators:start
```

## Environment Setup

Create `thriveapp/.env` with Firebase config vars:
```
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID
```

## Architecture

**Routing**: Expo Router (file-based). Two route groups:
- `app/(auth)/` — unauthenticated screens (login, signup, forgot password)
- `app/(tabs)/` — main app tabs (dashboard, gym, pt, groups, profile, admin)

**Auth flow**: `context/auth.tsx` wraps the app in `AuthProvider`, which uses `onAuthStateChanged` to watch Firebase auth state and automatically redirects between `(auth)` and `(tabs)` route groups.

**Role-based access**: Users have roles (`client`, `pt`, `admin`) stored in Firestore `users` collection. The Admin tab in `(tabs)/_layout.tsx` is hidden via `href: null` for non-admin/pt roles. Role is loaded from Firestore via `getUserProfile()` after auth.

**Services layer** (`services/`):
- `bookingService.ts` — all Firestore operations for bookings, recurring templates, and user profiles. Core data types (`Booking`, `RecurringSessionTemplate`, `UserProfile`) are exported from here.
- `groupService.ts` — group and group invite CRUD operations
- `errorService.ts` — global error handling and logging to Firestore `error_logs` collection

**Firebase config** (`config/firebaseConfig.ts`): Handles platform differences — mobile uses `initializeAuth` with `AsyncStorage` persistence; web uses standard `getAuth`.

**Cloud Functions** (`functions/src/index.ts`): A single scheduled function (`generateWeeklySessions`) runs daily at 2 AM to generate recurring booking instances up to 3 months ahead. It reads active `recurring_templates`, finds the latest generated booking for each template, and extends the series.

**Styling**: `constants/theme.ts` exports `Colors` (light/dark), `Radii`, and `Fonts`. Brand color is Thrive Orange `#F26122`. The `useColorScheme` hook has a web-specific implementation (`hooks/use-color-scheme.web.ts`).

**Path aliases**: `@/` maps to `thriveapp/` root (configured in `tsconfig.json`).

## Firestore Collections

- `users` — user profiles with `role: 'client' | 'pt' | 'admin'`
- `bookings` — individual booking instances (`type: 'gym' | 'pt' | 'group' | 'block'`)
- `recurring_templates` — master templates for recurring PT sessions
- `groups` — PT-owned groups with `memberIds`
- `group_invites` — email-based group invitations
- `error_logs` — client-side error reports

Security rules are in `thriveapp/firestore.rules`.
