# Google Apps Script

The production Apps Script project contains:

- `Code.gs` — the Lockout Tracker runtime and GitHub source of truth
- `PodcastTools.gs` — the private podcast source-pack generator
- `appsscript.json` — the Apps Script project manifest

Private Script Properties, spreadsheet data and deployment credentials are not stored in GitHub.

The local project is linked through an ignored `.clasp.json`. Use `clasp pull` only for comparison and `clasp push` only after verifying the target Script ID and complete file set. Updating the editor source does not update the live versioned deployment.
