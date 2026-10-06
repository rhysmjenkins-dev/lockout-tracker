import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const EPISODES_FILE = path.join(ROOT, 'podcasts', 'episodes.json');
const API_URL = process.env.LOCKOUT_API_URL || readApiUrl();
const API_KEY = process.env.GEMINI_API_KEY || '';
const PREPARE_ONLY = process.argv.includes('--prepare-only');
const START_INPUT = String(process.env.PODCAST_START_DATE || '').trim();
const END_INPUT = String(process.env.PODCAST_END_DATE || '').trim();
const EDITORIAL_NOTE = String(process.env.PODCAST_EDITORIAL_NOTE || '').trim();
const REPLACE_EXISTING = String(process.env.PODCAST_REPLACE_EXISTING || '').toLowerCase() === 'true';
const PRESENTER_HANDOVER = String(process.env.PODCAST_PRESENTER_HANDOVER || '').toLowerCase() === 'true';
const VOICE_STYLE = String(process.env.PODCAST_VOICE_STYLE || '').trim().toLowerCase();
const TEXT_MODEL = process.env.PODCAST_TEXT_MODEL || 'gemini-2.5-flash';
const TTS_MODEL = process.env.PODCAST_TTS_MODEL || 'gemini-2.5-flash';

function readApiUrl() {
  const config = fs.readFileSync(path.join(ROOT, 'config.js'), 'utf8');
  const match = config.match(/apiUrl:\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error('The production API URL could not be read from config.js.');
  return match[1];
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${label} must use YYYY-MM-DD.`);
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || isoDate(date) !== value) throw new Error(`${label} is not a valid date.`);
  return date;
}

function addDays(date, amount) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result;
}

function ukDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function displayDate(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London', day: 'numeric', month: 'long', year: 'numeric'
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function decodeHtml(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function tags(value) {
  return String(value || '').split(',').map(tag => decodeHtml(tag).trim()).filter(Boolean);
}

function truthy(value) {
  return value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === '1';
}

function isOfficialCompleted(session) {
  const status = String(session.status || '').toLowerCase();
  const lowerTags = tags(session.tags).map(tag => tag.toLowerCase());
  return status === 'completed' && !lowerTags.includes('testing') && !lowerTags.includes('void');
}

function resolvePeriod(episodes) {
  if (START_INPUT || END_INPUT) {
    if (!START_INPUT || !END_INPUT) throw new Error('Provide both a start date and an end date, or leave both blank.');
    const start = parseIsoDate(START_INPUT, 'Start date');
    const end = parseIsoDate(END_INPUT, 'End date');
    if (end < start) throw new Error('The end date must not be before the start date.');
    return { start: isoDate(start), end: isoDate(end) };
  }

  const dated = episodes.map(item => String(item.date || '')).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  if (!dated.length) throw new Error('No earlier dated episode exists. Supply the first period manually.');
  const start = addDays(parseIsoDate(dated.at(-1), 'Latest episode date'), 1);
  return { start: isoDate(start), end: isoDate(addDays(start, 6)) };
}

async function fetchJson(action) {
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    let response;
    try {
      response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(120000) });
    } catch (error) {
      if (attempt === 3) throw new Error(`The live API request failed for ${action}:${error.message}`);
      console.warn(`The live API request for ${action} failed (attempt${attempt}/3); retrying.`);
    }

    if (response?.ok) {
      const data = await response.json();
      if (data && data.error) throw new Error(`The live API rejected ${action}:${data.error}`);
      return data;
    }

    if (response) {
      const retryable = response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 3) throw new Error(`The live API returned HTTP ${response.status} for${action}.`);
      console.warn(`The live API returned HTTP ${response.status} for ${action} (attempt${attempt}/3); retrying.`);
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 15000));
  }
  throw new Error(`The live API request failed for
