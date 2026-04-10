---
description: Release Workflow
---
Follow these steps to release a new version of the ThriveApp:

1. **Branch**: Create a new feature branch from `main`.
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. **Implementation**: Add features or fixes.
3. **Verification**: Run type checks and manual verification.
   ```bash
   npx tsc --noEmit
   ```
4. **Finalize**: Merge the branch into `main`.
   ```bash
   git checkout main
   git merge feature/your-feature-name
   ```
5. **Version Bump**: Increment the version in `package.json`, `app.json`, and the UI (in `profile.tsx`). Then, sync the new version to Firebase so web users see the update banner:
   ```bash
   npm run sync-version
   ```
6. **Changelog**: Update the `CHANGELOG.md` in the project root. Ensure you include **all** changes implemented since the last tagged release, grouped by Added, Changed, and Removed.
   - Tip: Review your commit history or feature branch diffs to ensure nothing is missed.
7. **Tag**: Create a new Git tag for the version.
   ```bash
   git tag -a vX.Y.Z -m "Release version X.Y.Z"
   git push origin vX.Y.Z
   ```
8. **Release**: Push the final changes to `main` and trigger the deployment.
