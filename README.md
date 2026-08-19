# Lockout Tracker

A homemade card-game tracker for recording Lockout sessions, scores, statistics, Elo ratings and weekly podcast recaps.

## Current release

- Stable release and current build: **v2.2**
- Main app: https://rhysmjenkins-dev.github.io/lockout-tracker/
- Previous stable version: [v2.1](https://github.com/rhysmjenkins-dev/lockout-tracker/releases/tag/v2.1)

The `beta/` URL redirects to the main app so existing tester bookmarks continue to work.

## Repository layout

- Root HTML, CSS, JavaScript and configuration: the public GitHub Pages app
- `apps-script/`: the corresponding Google Apps Script source and project manifest
- `podcasts/`: episode metadata, transcripts, instructions and audio files
- `scripts/podcast/`: the weekly podcast generator
- `.github/workflows/`: podcast generation and validation workflows

Spreadsheet data and private Apps Script properties are deliberately not stored in this repository.
