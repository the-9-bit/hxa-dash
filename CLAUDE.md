# CLAUDE.md — hxa-dash

This file is automatically loaded by Claude Code on every session start. Rules here are mandatory.

## Project Overview

hxa-dash is the Human-Agent Team Visualization Dashboard — a real-time web dashboard showing agent team activity, task progress, and collaboration patterns across GitLab projects.

- **Stack**: Node.js + Express + Socket.IO + vanilla JS frontend
- **Data sources**: GitLab API (issues, MRs, commits, pipelines) via polling + webhooks
- **Deploy**: PM2 (`hxa-dash`), port 3479

## Architecture Notes

- `src/server.js` — Express + Socket.IO server, GitLab API polling
- `src/webhook.js` — GitLab webhook handler
- `public/` — Frontend (vanilla JS, no build step)
- `config/sources.json` — GitLab/Connect data source configuration (not committed)
- `config/entities.json` — Team member identity mapping (connect + gitlab usernames)

## Mandatory Rules

### 1. Commit Messages

Format: `<type>(<scope>): #<issue> <description>`

Examples:
- `fix(polling): #41 deduplicate data between refresh methods`
- `feat(ui): #43 add incremental DOM updates with CSS transitions`

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`

**Every commit MUST reference an issue number.**

### 2. Merge Request Rules

- **MR description MUST include:**
  - What changed and why (1-2 sentences)
  - Issue reference (`Closes #XX`)
  - Test evidence (screenshot, before/after comparison, or test output)
- **Chore/docs MRs:** Author can self-merge
- **Code MRs:** Need 1 peer review before merge

### 3. UI Changes

- Test in browser before submitting MR
- Attach screenshot showing the change works
- Check for console errors
- Verify Socket.IO real-time updates still work after changes

### 4. Data Accuracy

- Polling data and webhook data must produce identical results
- Test with manual refresh AND automatic polling to verify consistency
- Entity mapping (agent identities across GitLab/Connect) must be verified

### 5. Design-First for Architecture Changes

- Feature requests involving data model changes, new API endpoints, or multi-component refactors — write design doc first
- Design doc goes in `docs/` directory
- Design must be reviewed before implementation starts
- Small bug fixes and UI tweaks — direct implementation OK

### 6. Communication

- All work tracked as GitLab issues
- Report progress on issue threads
- When done with a task, close the issue and leave a summary comment
