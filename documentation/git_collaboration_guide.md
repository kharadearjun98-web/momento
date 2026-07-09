# Git Collaboration Guide

A comprehensive guide for team collaboration on the Memento project using Git and GitHub.

## Table of Contents
- [Overview](#overview)
- [Branch Strategy](#branch-strategy)
- [Daily Workflow](#daily-workflow)
- [Pull Requests](#pull-requests)
- [Handling Merge Conflicts](#handling-merge-conflicts)
- [Best Practices](#best-practices)
- [Common Commands Reference](#common-commands-reference)

---

## Overview

When multiple team members work on different aspects of the same project, proper Git workflows prevent conflicts, ensure code quality, and maintain a clean project history.

> [!IMPORTANT]
> **Never push directly to the `main` branch.** Always use feature branches and pull requests.

---

## Branch Strategy

### Main Branch
- `main` - Production-ready code
- Always stable and deployable
- Protected from direct pushes

### Feature Branches
Each team member creates a separate branch for their work:

```bash
# Create and switch to a new feature branch
git checkout -b feature/component-name

# Examples:
git checkout -b feature/dashboard-ui
git checkout -b feature/authentication
git checkout -b feature/logo-component
git checkout -b fix/login-bug
```

### Branch Naming Conventions
- **Features:** `feature/description` (e.g., `feature/user-profile`)
- **Bug fixes:** `fix/description` (e.g., `fix/login-error`)
- **Documentation:** `docs/description` (e.g., `docs/api-guide`)
- **Refactoring:** `refactor/description` (e.g., `refactor/auth-module`)

---

## Daily Workflow

### 1. Start Your Day - Sync with Main

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Switch back to your feature branch
git checkout feature/your-feature-name

# Merge latest main into your branch
git merge main
```

### 2. Work on Your Feature

```bash
# Make changes to your files
# Check what you've changed
git status

# Review your changes
git diff

# Stage specific files
git add path/to/file.tsx

# Or stage all changes
git add .

# Commit with a descriptive message
git commit -m "Add Logo component with gradient styling"
```

### 3. Commit Frequently
- Commit logical units of work
- Write clear, descriptive commit messages
- Use present tense: "Add feature" not "Added feature"

**Good commit messages:**
```bash
git commit -m "Add user authentication with Convex Auth"
git commit -m "Fix dashboard layout overflow issue"
git commit -m "Update database schema documentation"
```

**Bad commit messages:**
```bash
git commit -m "updates"
git commit -m "fix"
git commit -m "wip"
```

### 4. Push Your Branch

```bash
# First time pushing a new branch
git push -u origin feature/your-feature-name

# Subsequent pushes
git push
```

### 5. Keep Your Branch Updated

> [!TIP]
> Update your branch daily to avoid large merge conflicts later.

```bash
# Fetch latest changes from remote
git fetch origin

# Merge main into your feature branch
git checkout feature/your-feature-name
git merge origin/main

# Resolve any conflicts (see section below)
# Then continue working
```

---

## Pull Requests

### Creating a Pull Request

1. **Push your branch** to GitHub:
   ```bash
   git push origin feature/your-feature-name
   ```

2. **Go to GitHub** and navigate to the repository

3. **Click "Compare & pull request"** (or go to Pull Requests → New)

4. **Fill out the PR template:**
   - **Title:** Clear, concise description
   - **Description:** 
     - What changes were made
     - Why these changes were necessary
     - Any special testing instructions
     - Screenshots if UI changes

5. **Request review** from your teammate

6. **Wait for approval** before merging

### PR Description Template

```markdown
## What Changed
- Added Logo component to shared components
- Implemented gradient text effect
- Added responsive sizing

## Why
Needed a reusable logo component for consistent branding across the app

## Testing
- [x] Tested in Dashboard
- [x] Tested in mobile viewport
- [x] Verified gradient displays correctly

## Screenshots
[Attach screenshots here]
```

### Reviewing a Pull Request

When reviewing a teammate's PR:
1. **Read the description** to understand the changes
2. **Review the code** line by line
3. **Test locally** if needed:
   ```bash
   git fetch origin
   git checkout feature/their-feature-name
   npm install  # if dependencies changed
   npm run dev  # test the changes
   ```
4. **Leave comments** on specific lines or overall
5. **Approve or request changes**

### Merging a Pull Request

> [!WARNING]
> Only merge after:
> - At least one approval
> - All CI/CD checks pass (if configured)
> - Conflicts are resolved

**Merge options:**
- **Squash and merge** (recommended) - Combines all commits into one
- **Merge commit** - Preserves all individual commits
- **Rebase and merge** - Linear history, advanced option

---

## Handling Merge Conflicts

Conflicts occur when the same lines of code are changed in different branches.

### When You See a Conflict

```bash
git merge main
# Auto-merging components/Dashboard.tsx
# CONFLICT (content): Merge conflict in components/Dashboard.tsx
# Automatic merge failed; fix conflicts and then commit the result.
```

### Resolving Conflicts

1. **Open the conflicting file** in your editor
2. **Look for conflict markers:**
   ```typescript
   <<<<<<< HEAD
   // Your changes
   const title = "My Dashboard";
   =======
   // Their changes (from main)
   const title = "Team Dashboard";
   >>>>>>> main
   ```

3. **Decide what to keep:**
   - Keep your version
   - Keep their version
   - Combine both
   - Write something entirely new

4. **Edit the file** to your desired state:
   ```typescript
   // Resolved version
   const title = "Memento Dashboard";
   ```

5. **Mark as resolved:**
   ```bash
   git add components/Dashboard.tsx
   ```

6. **Complete the merge:**
   ```bash
   git commit -m "Merge main into feature/dashboard-ui, resolve title conflict"
   ```

### Preventing Conflicts

> [!TIP]
> Communication prevents conflicts!

- **Coordinate with your team** on who works on which files
- **Keep branches short-lived** - merge frequently
- **Pull from main often** - stay up to date
- **Split work clearly** - different components, different branches

---

## Best Practices

### 1. Pull Before You Push

**Always** pull the latest changes before pushing:
```bash
git pull origin main
git push origin feature/your-feature-name
```

### 2. Commit Often, Push Regularly

- Commit every logical change
- Push at least once per day
- Don't let your branch get too far behind main

### 3. Write Meaningful Commit Messages

Follow this format:
```
[Type] Brief description (50 chars or less)

More detailed explanation if needed (wrap at 72 chars).
Explain what and why, not how.

- Bullet points are okay
- Use present tense: "Add" not "Added"
```

**Examples:**
```bash
git commit -m "feat: Add user profile component with avatar upload"
git commit -m "fix: Resolve authentication redirect loop"
git commit -m "docs: Update API documentation with new endpoints"
git commit -m "refactor: Extract auth logic into separate hooks"
```

### 4. Keep Feature Branches Small

- One feature/fix per branch
- Aim to merge within 2-3 days
- Large features? Break into smaller PRs

### 5. Use .gitignore Properly

Ensure local files don't cause conflicts:
```gitignore
# Local environment files
.env.local
.env.development.local

# IDE specific files
.vscode/
.idea/

# OS files
.DS_Store
Thumbs.db

# Dependencies
node_modules/

# Build outputs
.next/
dist/
build/
```

### 6. Communicate with Your Team

- **Morning:** Check what others are working on
- **Before editing shared files:** Ask if anyone else is working on them
- **After major changes:** Let the team know
- **Use GitHub Issues** to track tasks and assignments

---

## Common Commands Reference

### Starting Work
```bash
git checkout main              # Switch to main
git pull origin main           # Get latest changes
git checkout -b feature/name   # Create new feature branch
```

### During Work
```bash
git status                     # See what's changed
git diff                       # See detailed changes
git add .                      # Stage all changes
git add path/to/file          # Stage specific file
git commit -m "message"        # Commit changes
git push                       # Push to remote
```

### Staying Updated
```bash
git fetch origin              # Fetch remote changes
git merge origin/main         # Merge main into current branch
git pull origin main          # Fetch and merge main
```

### Checking Status
```bash
git log --oneline             # See commit history
git branch                    # List local branches
git branch -a                 # List all branches (including remote)
git remote -v                 # See remote repositories
```

### Undoing Changes
```bash
git checkout -- file.tsx      # Discard changes to a file
git reset HEAD file.tsx       # Unstage a file
git reset --soft HEAD~1       # Undo last commit, keep changes
git reset --hard HEAD~1       # Undo last commit, discard changes
```

> [!CAUTION]
> `git reset --hard` permanently deletes changes. Use with caution!

### Branch Management
```bash
git branch -d feature/name    # Delete local branch (after merge)
git push origin --delete feature/name  # Delete remote branch
```

---

## Quick Start Checklist

For each new feature:
- [ ] Pull latest main: `git checkout main && git pull origin main`
- [ ] Create feature branch: `git checkout -b feature/my-feature`
- [ ] Make changes and commit regularly
- [ ] Keep branch updated: merge main frequently
- [ ] Push branch: `git push -u origin feature/my-feature`
- [ ] Create pull request on GitHub
- [ ] Request review from teammate
- [ ] Address feedback and make changes
- [ ] Merge after approval
- [ ] Delete branch after merge

---

## Getting Help

### Common Issues

**Issue:** Can't push my branch
```bash
# Solution: Pull first, then push
git pull origin feature/your-branch
git push origin feature/your-branch
```

**Issue:** Accidentally committed to main
```bash
# Solution: Move commits to a new branch
git branch feature/saved-work
git reset --hard origin/main
git checkout feature/saved-work
```

**Issue:** Want to update commit message
```bash
# If you haven't pushed yet:
git commit --amend -m "New commit message"

# If you already pushed:
# Don't amend! Create a new commit instead
```

---

## GitHub Repository Settings

### Setting Up Branch Protection (for repo admin)

1. Go to **Settings** → **Branches**
2. Click **Add rule**
3. Branch name pattern: `main`
4. Enable:
   - ✅ Require pull request before merging
   - ✅ Require approvals (1-2 reviewers)
   - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
5. Save changes

This prevents accidental direct pushes to main and ensures code review.

---

## Team Workflow Example

### Scenario: Two developers working on Memento

**Developer A (working on UI components):**
```bash
git checkout -b feature/dashboard-ui
# Makes changes to Dashboard.tsx, Logo.tsx
git add .
git commit -m "Add responsive dashboard layout"
git push origin feature/dashboard-ui
# Creates PR on GitHub
```

**Developer B (working on authentication):**
```bash
git checkout -b feature/convex-auth
# Makes changes to auth/, lib/auth.ts
git add .
git commit -m "Implement Convex Auth integration"
git push origin feature/convex-auth
# Creates PR on GitHub
```

**Both PRs can be merged independently** since they touch different files!

**If there's overlap:**
- Developer A merges first
- Developer B pulls main: `git merge origin/main`
- Developer B resolves conflicts if any
- Developer B updates PR and merges

---

## Resources

- [Git Official Documentation](https://git-scm.com/doc)
- [GitHub Guides](https://guides.github.com/)
- [Atlassian Git Tutorials](https://www.atlassian.com/git/tutorials)
- [Interactive Git Branching Tutorial](https://learngitbranching.js.org/)

---

**Questions?** Discuss with your team or refer to the resources above!
