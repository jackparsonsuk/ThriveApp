---
name: release
description: Runs the ThriveApp release procedure end to end — type-check, merge to main, bump the version in package.json/app.json/config.ts, update CHANGELOG.md, deploy firestore.rules and/or Cloud Functions if they changed, tag the release, and push main to trigger the Vercel web deploy. Use this whenever the user says "release", "cut a release", "ship this version", "let's release X.Y.Z", "deploy ThriveApp", or asks to publish/tag a new version of the app. This is the authoritative release checklist for this repo (mirrors thriveapp/.agents/workflows/release.md) — use it instead of improvising release steps, since it's the only place that remembers to deploy Firestore rules and Cloud Functions, which nothing else in the repo automates.
---

# ThriveApp Release

This mirrors `thriveapp/.agents/workflows/release.md`. If the two ever disagree, that file is the source of truth — update this skill to match it, not the other way around.

ThriveApp is a live app with a real Firebase project and real users. Steps 6-8 below (deploy rules/functions, tag, push main) hit shared or production infrastructure and can't be easily undone — **stop and get explicit confirmation before each one.** Don't chain them just because the previous step went fine. Steps 1-5 are local and reversible (type-check, edit version numbers, edit the changelog) — do those without asking, but show a summary of what changed before moving into the confirm-gated steps.

## Steps

1. **Confirm branch state.** Run `git status` and check the current branch. If the release work is on a feature branch, note it for the merge step. If it's already on `main`, that's fine too.

2. **Type-check.** From `thriveapp/`:
   ```
   npx tsc --noEmit
   ```
   If this fails, stop and report the errors — don't release code that doesn't type-check.

3. **Merge to main** (confirm first, skip if already on `main`):
   ```
   git checkout main
   git merge <branch>
   ```

4. **Version bump.** Agree the new version number with the user (patch for fixes, minor for features — follow the semver pattern already in `CHANGELOG.md`). These three files all carry the version independently and nothing keeps them in sync automatically, so update all three to match:
   - `thriveapp/package.json` → `version`
   - `thriveapp/app.json` → `expo.version`
   - `thriveapp/constants/config.ts` → `APP_VERSION`

   Then push the new version to Firebase so the web update banner (`components/UpdateBanner.tsx`) picks it up:
   ```
   cd thriveapp && npm run sync-version
   ```
   This needs `thriveapp/service-account.json`, which is gitignored and won't exist on a fresh checkout. If it's missing, tell the user how to get one (Firebase Console → Project Settings → Service Accounts → Generate new private key → save as `thriveapp/service-account.json`) and skip the sync — don't let a missing service account block the rest of the release.

5. **Changelog.** Add a new section at the top of `thriveapp/CHANGELOG.md`, above the current top entry, in the existing format:
   ```
   ## [X.Y.Z] - YYYY-MM-DD

   ### Added
   ### Changed
   ### Fixed
   ### Removed
   ```
   Base it on `git log`/diffs since the last version tag, not just the latest commit — check nothing since the last release got missed.

6. **Deploy backend changes, if any** (confirm before each deploy — these are live):
   - Diff `firestore.rules` against the last tag: `git diff <last-tag> -- thriveapp/firestore.rules`. If it changed, summarize the change for the user, suggest testing it in the Firebase Console Rules Playground or the local emulator first, then:
     ```
     cd thriveapp && npx firebase-tools deploy --only firestore:rules
     ```
   - Diff `thriveapp/functions/src/`. If anything changed:
     ```
     cd thriveapp/functions && npm run deploy
     ```
   - If neither changed, skip this step — don't deploy things that didn't change.

7. **Tag** (confirm before pushing the tag):
   ```
   git tag -a vX.Y.Z -m "Release version X.Y.Z"
   git push origin vX.Y.Z
   ```

8. **Push main** (confirm first):
   ```
   git push origin main
   ```
   This triggers the Vercel web deploy automatically — Vercel watches `main`. Mobile updates are a separate manual step this skill does **not** run: remind the user that shipping the native apps needs `eas build --profile production` (from `thriveapp/`), plus an app-store submission.

## Why the confirmation gates matter

Firestore rules are live security config for real user data — a bad deploy there has immediate blast radius on who can read/write what. Pushing the tag and `main` are both visible to the whole team and, via Vercel, go straight to production. None of these should run speculatively — always say what's about to happen and wait for a clear go-ahead before running it.
