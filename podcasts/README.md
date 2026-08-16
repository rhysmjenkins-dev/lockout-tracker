# Adding a podcast episode

## Automated audio draft

The **Generate podcast draft** GitHub workflow creates an audio-only proposal from the next unpublished Monday-to-Sunday period. It reads official completed sessions from the live app, supplies all recorded session and hand notes to the writer, generates a two-presenter British sports-roundup transcript and converts it to an M4A file.

The workflow opens a draft pull request. The proposed episode does not appear in the live app until that pull request is merged. Closing the pull request rejects it; rerunning the workflow replaces it. An optional editorial note can be entered when regenerating.

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
