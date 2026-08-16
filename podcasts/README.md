# Adding a podcast episode

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
