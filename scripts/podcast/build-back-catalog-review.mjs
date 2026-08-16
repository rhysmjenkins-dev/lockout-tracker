import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const outputRoot = path.join(root, 'podcasts', 'test-output');
const repository = process.env.GITHUB_REPOSITORY || 'rhysmjenkins-dev/lockout-tracker';
const branch = process.env.PODCAST_TEST_BRANCH || 'automation/podcast-back-catalog-review';

function displayDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/London'
  }).format(new Date(`${value}T12:00:00Z`));
}

const summaries = fs.readdirSync(outputRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => path.join(outputRoot, entry.name, 'summary.json'))
  .filter(file => fs.existsSync(file))
  .map(file => JSON.parse(fs.readFileSync(file, 'utf8')))
  .sort((a, b) => a.period.start.localeCompare(b.period.start));

if (!summaries.length) throw new Error('No back-catalog podcast tests were generated.');

const rawBase = `https://raw.githubusercontent.com/${repository}/refs/heads/${branch}`;
const lines = [
  '# Podcast back-catalog comparison',
  '',
  'These five episodes were regenerated with the proposed automated prompt and voices. They are test files only and cannot appear in the live app from this branch.',
  ''
];

summaries.forEach((summary, index) => {
  lines.push(
    `## Test ${index + 1}: ${summary.title}`,
    '',
    `**Period:** ${displayDate(summary.period.start)} to ${displayDate(summary.period.end)}`,
    '',
    summary.description,
    '',
    `[Listen to the test audio](${rawBase}/${summary.audio_file}) · [Read the transcript](${rawBase}/${summary.transcript_file})`,
    '',
    `${summary.sessions} official session${summary.sessions === 1 ? '' : 's'} and ${summary.notes} recorded note${summary.notes === 1 ? '' : 's'} supplied.`,
    ''
  );
});

lines.push(
  '## What to compare',
  '',
  '- Accuracy and selection of the important stories',
  '- British tone and humour',
  '- Continuity between weeks',
  '- Voice, pace and pronunciation',
  '- Titles and descriptions',
  ''
);

const review = `${lines.join('\n')}\n`;
fs.writeFileSync(path.join(outputRoot, 'README.md'), review);
