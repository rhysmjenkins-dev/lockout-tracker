# Adding a podcast episode

## Automated episode

The **Generate weekly podcast** GitHub workflow creates the next audio episode from the next unpublished Monday-to-Sunday period. It runs automatically each Monday morning and can also be started manually by a repository administrator. It reads official completed sessions from the live app, supplies all recorded session and hand notes to the writer, generates a Roy-and-Sarah British sports-roundup transcript, creates each presenter turn independently to prevent voice drift, and joins the clips into an M4A file.

After successful generation, the workflow commits the audio, transcript, title and description directly to `main`, where the episode appears in the app. A failed run changes nothing. A repository administrator can manually rerun a period with an optional editorial note, deliberately replace an existing episode, or enable a one-off presenter-handover introduction. Players do not receive podcast controls inside the app.

The repository must contain a `GEMINI_API_KEY` Actions secret. Never put the key in this repository or in Apps Script.

## Manual upload

1. Download the NotebookLM episode as an MP3 or M4A file.
2. Give it a short filename containing letters, numbers and hyphens.
3. Upload it to `podcasts/audio/`.
4. Add the episode at the top of `podcasts/episodes.json`.

Example:

```json
{
  "title": "Weekly Lockout Recap",
  "date": "2026-07-28",
  "description": "The week's games in five minutes.",
  "audio_file": "podcasts/audio/2026-07-28-weekly-recap.mp3"
}
```

Separate multiple entries with commas. MP3 has the widest browser support; the existing M4A episodes are also supported.
