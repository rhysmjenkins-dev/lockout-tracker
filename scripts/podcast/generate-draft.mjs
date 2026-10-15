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
const TEXT_MODEL = process.env.PODCAST_TEXT_MODEL || 'gemini-3.8-flash';
const TTS_MODEL = process.env.PODCAST_TTS_MODEL || 'gemini-3.8-flash';

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
      if (attempt === 3) throw new Error(`The live API request failed for ${action}: ${error.message}`);
      console.warn(`The live API request for ${action} failed (attempt ${attempt}/3); retrying.`);
    }

    if (response?.ok) {
      const data = await response.json();
      if (data && data.error) throw new Error(`The live API rejected ${action}: ${data.error}`);
      return data;
    }

    if (response) {
      const retryable = response.status === 404 || response.status === 408 || response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 3) throw new Error(`The live API returned HTTP ${response.status} for ${action}.`);
      console.warn(`The live API returned HTTP ${response.status} for ${action} (attempt ${attempt}/3); retrying.`);
    }

    await new Promise(resolve => setTimeout(resolve, attempt * 15000));
  }
  throw new Error(`The live API request failed for ${action}.`);
}

function parseJoinInfo(session) {
  try {
    const value = JSON.parse(decodeHtml(session.player_join_info || '{}'));
    if (!value || typeof value !== 'object') return {};
    return Object.fromEntries(Object.entries(value)
      .filter(([, info]) => info && typeof info === 'object' && info.starting_score !== undefined)
      .map(([id, info]) => [String(id), Number(info.starting_score || 0)]));
  } catch {
    return {};
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function playerName(map, id) {
  return map[String(id)] || `Player ${id}`;
}

function summariseSession(item, playerNames, eloRows) {
  const session = item.session;
  const rows = Array.isArray(item.hands) ? item.hands : [];
  const joinInfo = parseJoinInfo(session);
  const playerIds = unique(rows.map(row => String(row.player_id)));
  const totals = Object.fromEntries(playerIds.map(id => [id, Number(joinInfo[id] || 0)]));
  rows.forEach(row => {
    const id = String(row.player_id);
    totals[id] = Number(totals[id] || 0) + Number(row.score || 0);
  });
  const ranking = playerIds.slice().sort((a, b) => Number(totals[a]) - Number(totals[b]) || playerName(playerNames, a).localeCompare(playerName(playerNames, b)));
  const winningScore = ranking.length ? totals[ranking[0]] : null;
  const winners = ranking.filter(id => totals[id] === winningScore).map(id => playerName(playerNames, id));
  const handNumbers = unique(rows.map(row => Number(row.hand_number))).sort((a, b) => a - b);
  const handReports = handNumbers.map(number => {
    const handRows = rows.filter(row => Number(row.hand_number) === number);
    const declaration = handRows.find(row => String(row.lockout_player_id || '').trim());
    const comments = unique(handRows.map(row => decodeHtml(row.comment).trim()));
    return {
      hand: number,
      scores: handRows.map(row => ({ player: playerName(playerNames, row.player_id), score: Number(row.score || 0) })),
      lockout: declaration ? {
        player: playerName(playerNames, declaration.lockout_player_id),
        result: truthy(declaration.false_lockout) ? 'false' : 'successful',
        declared_score: declaration.lockout_score === '' || declaration.lockout_score === null || declaration.lockout_score === undefined
          ? Number(declaration.score || 0)
          : Number(declaration.lockout_score)
      } : null,
      notes: comments
    };
  });
  const sessionElo = eloRows
    .filter(row => String(row.session_id) === String(session.session_id))
    .map(row => ({ player: playerName(playerNames, row.player_id), change: Number(row.change || 0), new_rating: Math.round(Number(row.new_rating || 1000)) }));

  return {
    session_id: Number(session.session_id),
    title: decodeHtml(session.title || 'Untitled session'),
    date: ukDate(session.date_ended || session.date_started),
    host: playerName(playerNames, session.host_player_id),
    tags: tags(session.tags),
    session_notes: decodeHtml(session.notes).trim(),
    hands_played: handNumbers.length,
    winners,
    final_scores: ranking.map(id => ({
      player: playerName(playerNames, id),
      score: totals[id],
      late_join_start: Object.prototype.hasOwnProperty.call(joinInfo, id) ? Number(joinInfo[id]) : null
    })),
    elo_changes: sessionElo,
    hands: handReports
  };
}

function leaderboardAtEnd(players, sessions, eloRows, periodEnd) {
  const sessionDates = Object.fromEntries(sessions.map(item => [String(item.session.session_id), ukDate(item.session.date_ended || item.session.date_started)]));
  const latest = {};
  eloRows.forEach(row => {
    const date = sessionDates[String(row.session_id)];
    if (!date || date > periodEnd) return;
    const id = String(row.player_id);
    if (!latest[id] || Number(row.elo_id) > Number(latest[id].elo_id)) latest[id] = row;
  });
  return players.map(player => {
    const row = latest[String(player.player_id)];
    return { player: decodeHtml(player.username), rating: row ? Math.round(Number(row.new_rating)) : 1000 };
  }).sort((a, b) => b.rating - a.rating || a.player.localeCompare(b.player));
}

function historicalContext(currentSessions, earlierSessions) {
  const currentPlayers = unique(currentSessions.flatMap(session => session.final_scores.map(row => row.player)));
  return currentPlayers.map(player => {
    const appearances = earlierSessions.filter(session => session.final_scores.some(row => row.player === player));
    if (!appearances.length) return `${player} made their first official recorded appearance in this period.`;
    let winningStreak = 0;
    for (let index = appearances.length - 1; index >= 0; index -= 1) {
      if (!appearances[index].winners.includes(player)) break;
      winningStreak += 1;
    }
    const previous = appearances.at(-1);
    const score = previous.final_scores.find(row => row.player === player)?.score ?? 'an unknown score';
    const pieces = [`${player}'s previous appearance was ${previous.title} on ${previous.date}, finishing on ${score}.`];
    if (winningStreak >= 2) pieces.push(`${player} entered this period having won ${winningStreak} consecutive appearances.`);
    return pieces.join(' ');
  });
}

function countNotes(sessionFacts) {
  return sessionFacts.reduce((count, session) => count + (session.session_notes ? 1 : 0) +
    session.hands.reduce((handCount, hand) => handCount + hand.notes.length, 0), 0);
}

function buildEditorialPrompt(facts) {
  return `You are writing a short episode of The Lockout Weekly, a homemade sports-style recap of card games between friends.

Return strict JSON with exactly these string fields: "title", "description", and "transcript".

TRANSCRIPT FORMAT
- Target 330 to 360 words total. The transcript MUST be between 300 and 400 words.
- A two-presenter conversation. Every spoken paragraph must begin with either "Roy:" or "Sarah:".
- Roy and Sarah are presenters, never players.
- Use 5 to 8 alternating spoken paragraphs so the exchange remains natural without creating excessive audio fragments.
- Begin with the strongest story, not a generic welcome.
- End with one brief look ahead.
- Cover exactly the supplied dates. A seven-day Monday-to-Sunday period is a week; a shorter special period is not. Never call either a fortnight, even as a joke or self-correction.
- If the supplied period is shorter than seven days, frame it explicitly as a Weekend Special; otherwise frame it as the weekly episode.

VOICE AND TONE
- British English; warm, dry, affectionate and knowingly over-serious.
- Resemble a familiar British radio sports roundup.
- Keep the humour tongue-in-cheek throughout, using understated wit and gentle incredulity rather than forced jokes.
- Build a consistent comedy contrast between the presenters. Roy is grumpy, blunt, terse and difficult to impress, delivering reluctant praise and deadpan disbelief without becoming nasty. Sarah is cheerful, warm and optimistic, enthusiastically setting up stories and lightly teasing Roy out of his gloom.
- Let their contrasting reactions create short natural exchanges, but keep the game facts central and do not turn the episode into a comedy sketch.
- Avoid American sports-show hype or terminology (including "slate" and "runs the table"), forced slang, exaggerated accents, laddishness and corporate language.
- Assume regular listeners already understand Lockout. Do not explain its basic scoring.

EDITORIAL RULES
- Use the supplied facts only. Never invent quotations, motives, reactions, personalities, nicknames, rivalries or events.
- Never invent or infer a venue, location or setting. Mention one only if it appears explicitly in the verified source data.
- Every non-empty session note and hand note is supplied deliberately. Consider all of them and reflect each distinct note where it can be stated naturally; never silently replace a recorded note with an invented version.
- Use numbers to support stories rather than reading lists.
- A lower final score wins. State comparisons naturally and unambiguously without explaining this rule to listeners.
- Prioritise results, turning points, streaks, collapses, comebacks, lockouts and statistical oddities.
- Compare the supplied start- and end-of-period Elo leaderboards. Always mention material movement: a change of leader, a notable climb or fall, or an unusually large rating gain or loss. Do not recite positions that did not meaningfully change.
- Previous context should be brief and used only when relevant.
- Testing, void and unfinished sessions have already been excluded.
- Do not recite session numbers unless a number is itself relevant to the story.
- Give the episode a concise, story-led title in the style of the existing episodes. Do not use the programme name, a date or a generic weekly-recap title.
- Keep the description to one lively, specific sentence. Avoid generic phrases such as "comprehensive review", "busy week" or "across the calendar".

${PRESENTER_HANDOVER ? 'ONE-OFF PRESENTER HANDOVER\nOpen by making two points clear and concise: Roy and Sarah are taking over as the regular presenters of the weekly Lockout update podcast from this episode onwards, while this particular Friday-to-Sunday edition is a one-off Weekend Special. Use this introduction once only, then move straight into the strongest story. Do not imply that the game, app or podcast itself is restarting, and do not suggest that Roy and Sarah are only temporary presenters.\n\n' : ''}${EDITORIAL_NOTE ? `EXTRA EDITORIAL NOTE FROM RHYS\n${EDITORIAL_NOTE}\n\n` : ''}VERIFIED SOURCE DATA
${JSON.stringify(facts, null, 2)}`;
}

async function callGeminiInteraction(model, payload) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': API_KEY
    },
    body: JSON.stringify({ model, ...payload }),
    signal: AbortSignal.timeout(240000)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Gemini ${model} failed: ${detail}`);
  }
  return body;
}

function interactionOutput(body, type) {
  return (body.steps || [])
    .filter(step => step?.type === 'model_output')
    .flatMap(step => Array.isArray(step.content) ? step.content : [])
    .filter(item => item?.type === type);
}

function interactionText(body) {
  return interactionOutput(body, 'text').map(item => item.text || '').join('').trim();
}

function dialogueTurns(transcript) {
  return transcript.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
    const match = line.match(/^(Roy|Sarah):\s+(.+)$/);
    if (!match) throw new Error(`Transcript line ${index + 1} is not a valid Roy/Sarah turn.`);
    return { speaker: match[1], text: match[2].trim() };
  });
}

function parseDraft(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const draft = JSON.parse(cleaned);
  for (const field of ['title', 'description', 'transcript']) {
    if (!draft[field] || typeof draft[field] !== 'string') throw new Error(`Generated draft is missing ${field}.`);
  }
  dialogueTurns(draft.transcript);
  return { title: draft.title.trim(), description: draft.description.trim(), transcript: draft.transcript.trim() };
}

function draftIssues(draft) {
  const issues = [];
  const wordCount = draft.transcript.split(/\s+/).filter(Boolean).length;
  const turns = dialogueTurns(draft.transcript);
  if (wordCount < 300 || wordCount > 400) issues.push(`transcript is ${wordCount} words; it must be 300 to 400`);
  if (turns.length < 5 || turns.length > 8) issues.push(`transcript has ${turns.length} turns; it must have 5 to 8`);
  if (turns.some((turn, index) => index > 0 && turn.speaker === turns[index - 1].speaker)) issues.push('presenters do not alternate consistently');
  if (/\b(fortnight|slate)\b/i.test(draft.transcript)) issues.push('transcript uses a forbidden time period or American sports term');
  if (/\bruns? the table\b/i.test(`${draft.title}${draft.transcript}`)) issues.push('draft uses the American phrase "runs the table"');
  if (/the lockout weekly|\b20\d{2}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(draft.title)) {
    issues.push('title is generic or date-led rather than story-led');
  }
  return issues;
}

async function generateDraft(facts) {
  let retryNote = '';
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      const delayMs = attempt === 2 ? 120000 : 300000;
      console.warn(`Retry attempt ${attempt}/${maxAttempts}: Waiting${delayMs / 1000} seconds for high-demand API traffic to clear...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    try {
      const body = await callGeminiInteraction(TEXT_MODEL, {
        input: `${buildEditorialPrompt(facts)}${retryNote}`,
        response_format: [{
          type: 'text',
          mime_type: 'application/json',
          schema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              transcript: { type: 'string' }
            },
            required: ['title', 'description', 'transcript']
          }
        }]
      });

      const draft = parseDraft(interactionText(body));
      const issues = draftIssues(draft);

      if (!issues.length) {
        console.log(`Draft passed all editorial checks on attempt ${attempt}.`);
        return draft;
      }

      console.warn(`Attempt ${attempt} rejected due to issues:\n-${issues.join('\n- ')}`);
      retryNote = `\n\nTHE PREVIOUS ATTEMPT WAS REJECTED\nCorrect all of these problems in a completely fresh draft:\n- ${issues.join('\n- ')}`;

    } catch (error) {
      console.warn(`Attempt ${attempt} failed with API error:${error.message}`);
      
      const isHighDemand = /high demand|503|unavailable|RESOURCE_EXHAUSTED/i.test(error.message);
      if (isHighDemand) {
        console.error('Server capacity / high demand error detected. Aborting workflow immediately to preserve daily quota.');
        throw error;
      }

      if (attempt === maxAttempts) throw error;
    }
  }

  throw new Error(`Gemini could not produce a podcast draft that passed the editorial checks after ${maxAttempts} attempts.`);
}

function wavFromPcm(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  con
