# Google Apps Script

The production Apps Script project contains:

- `Code.gs` — the Lockout Tracker runtime and GitHub source of truth
- `PodcastTools.gs` — the manual podcast source-pack fallback retained while the automated weekly workflow proves stable
- `appsscript.json` — the Apps Script project manifest

Private Script Properties, spreadsheet data and deployment credentials are not stored in GitHub.

Each local worktree must be linked separately through an ignored `.clasp.json`. Use `clasp pull` only for comparison and `clasp push` only after verifying the target Script ID and complete file set. Updating the editor source does not update the live versioned deployment.
