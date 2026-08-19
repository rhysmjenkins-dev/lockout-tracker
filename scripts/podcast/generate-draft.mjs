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
const TEXT_MODEL = process.env.PODCAST_TEXT_MODEL || 'gemini-3.5-flash-lite';
const TTS_MODEL = process.env.PODCAST_TTS_MODEL || 'gemini-3.1-flash-tts-preview';

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
    const score = previous.final_scores.find(row => row.player === player)?.score;
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
- 310 to 380 words, targeting about two minutes at a slightly brisk but unhurried conversational pace.
- A two-presenter conversation. Every spoken paragraph must begin with either "Roy:" or "Sam:".
- Roy and Sam are presenters, never players.
- Begin with the strongest story, not a generic welcome.
- End with one brief look ahead.
- Cover exactly the supplied dates. A seven-day Monday-to-Sunday period is a week; a shorter special period is not. Never call either a fortnight, even as a joke or self-correction.
- If the supplied period is shorter than seven days, frame it explicitly as a Weekend Special; otherwise frame it as the weekly episode.

VOICE AND TONE
- British English; warm, dry, affectionate and knowingly over-serious.
- Resemble a familiar British radio sports roundup.
- Keep the humour tongue-in-cheek throughout, using understated wit and gentle incredulity rather than forced jokes.
- Build a consistent comedy contrast between the presenters. Roy is grumpy, blunt, terse and difficult to impress, delivering reluctant praise and deadpan disbelief without becoming nasty. Sam is cheerful, warm and optimistic, enthusiastically setting up stories and lightly teasing Roy out of his gloom.
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

${PRESENTER_HANDOVER ? 'ONE-OFF PRESENTER HANDOVER\nOpen by making two points clear and concise: Roy and Sam are taking over as the regular presenters of the weekly Lockout update podcast from this episode onwards, while this particular Friday-to-Sunday edition is a one-off Weekend Special. Use this introduction once only, then move straight into the strongest story. Do not imply that the game, app or podcast itself is restarting, and do not suggest that Roy and Sam are only temporary presenters.\n\n' : ''}${EDITORIAL_NOTE ? `EXTRA EDITORIAL NOTE FROM RHYS\n${EDITORIAL_NOTE}\n\n` : ''}VERIFIED SOURCE DATA
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

function parseDraft(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const draft = JSON.parse(cleaned);
  for (const field of ['title', 'description', 'transcript']) {
    if (!draft[field] || typeof draft[field] !== 'string') throw new Error(`Generated draft is missing ${field}.`);
  }
  const spoken = draft.transcript.split(/\r?\n/).filter(line => line.trim());
  if (!spoken.every(line => /^(Roy|Sam):\s+/.test(line))) {
    throw new Error('Generated transcript contains text outside the Roy/Sam dialogue format.');
  }
  return { title: draft.title.trim(), description: draft.description.trim(), transcript: draft.transcript.trim() };
}

function draftIssues(draft) {
  const issues = [];
  const wordCount = draft.transcript.split(/\s+/).filter(Boolean).length;
  if (wordCount < 310 || wordCount > 380) issues.push(`transcript is ${wordCount} words; it must be 310 to 380`);
  if (/\b(fortnight|slate)\b/i.test(draft.transcript)) issues.push('transcript uses a forbidden time period or American sports term');
  if (/\bruns? the table\b/i.test(`${draft.title} ${draft.transcript}`)) issues.push('draft uses the American phrase "runs the table"');
  if (/the lockout weekly|\b20\d{2}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(draft.title)) {
    issues.push('title is generic or date-led rather than story-led');
  }
  return issues;
}

async function generateDraft(facts) {
  let retryNote = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
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
    if (!issues.length) return draft;
    retryNote = `\n\nTHE PREVIOUS ATTEMPT WAS REJECTED\nCorrect all of these problems in a completely fresh draft:\n- ${issues.join('\n- ')}`;
  }
  throw new Error('Gemini could not produce a podcast draft that passed the editorial checks after three attempts.');
}

function wavFromPcm(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function generateAudio(transcript, wavPath) {
  const voiceDirection = VOICE_STYLE === 'dry-pundit'
    ? 'Roy leads with a dry, blunt and sceptical football-pundit delivery, using short, clipped observations and a distinct natural Cork-influenced Irish cadence. He is noticeably grumpy, terse, matter-of-fact and difficult to impress, using deadpan disbelief, sceptical pauses and reluctant praise without becoming hostile. Roy is a fictional presenter and must not imitate the voice, speech patterns or persona of any identifiable real person. Sam is a woman and uses the original Kore voice assigned below: her voice must remain clearly female, warm, upbeat and naturally British, with no Irish or American accent. She provides an amused counterpoint and gently draws Roy into the discussion. Keep the two speakers consistently distinct; Roy\'s male voice and Cork cadence must never carry into any of Sam\'s lines. Use exactly these two voices throughout: never introduce a third voice, narrator or American pronunciation. Their contrast should feel natural and funny rather than theatrical. Use a slightly brisker conversational pace than a formal radio roundup, without rushing words or losing natural reactions and pauses. Keep the complete episode close to two minutes. Neither presenter should sound posh, polished, performative or like a formal radio announcer.'
    : 'Roy and Sam are two restrained British radio sports presenters. Use natural British English pronunciation, conversational pacing, warmth and understated dry humour.';
  const directorNotes = `Read the following transcript exactly as written. ${voiceDirection} Do not use exaggerated accents or American sports-show excitement.\n\n${transcript}`;
  const body = await callGeminiInteraction(TTS_MODEL, {
    input: directorNotes,
    response_format: { type: 'audio' },
    generation_config: {
      speech_config: [
        { speaker: 'Roy', voice: 'Charon' },
        { speaker: 'Sam', voice: 'Kore' }
      ]
    }
  });
  const part = body.output_audio || body.outputAudio || interactionOutput(body, 'audio')[0];
  if (!part?.data) throw new Error('Gemini returned no audio data.');
  const raw = Buffer.from(part.data, 'base64');
  const mime = String(part.mime_type || part.mimeType || 'audio/L16;rate=24000');
  const rate = Number((mime.match(/rate=(\d+)/i) || [])[1] || 24000);
  const audio = /wav/i.test(mime) ? raw : wavFromPcm(raw, rate);
  fs.writeFileSync(wavPath, audio);
}

function convertAudio(wavPath, outputPath) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wavPath, '-c:a', 'aac', '-b:a', '96k', outputPath], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg could not create the M4A file: ${result.stderr || result.stdout}`);
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) throw new Error('The generated audio file is unexpectedly empty.');
}

function episodeNumber(episodes) {
  const numbers = episodes.map(item => Number((String(item.title || '').match(/^Episode\s+(\d+)/i) || [])[1] || 0));
  return Math.max(0, ...numbers) + 1;
}

function slugPeriod(period) {
  return `${period.start}-to-${period.end}`;
}

function writeGitHubOutput(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([key, value]) => `${key}=${String(value).replace(/\r?\n/g, ' ')}`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`);
}

async function main() {
  const episodes = JSON.parse(fs.readFileSync(EPISODES_FILE, 'utf8'));
  const period = resolvePeriod(episodes);
  const today = ukDate(new Date());
  if (period.end > today) {
    if (START_INPUT || END_INPUT) throw new Error(`The period does not finish until ${displayDate(period.end)}.`);
    console.log(`No podcast is due: the next period does not finish until ${displayDate(period.end)}.`);
    writeGitHubOutput({ skip: 'true', period: `${period.start} to ${period.end}` });
    return;
  }
  const existingIndex = episodes.findIndex(item => String(item.date) === period.end);
  if (!PREPARE_ONLY && existingIndex >= 0 && !REPLACE_EXISTING) {
    throw new Error(`An episode dated ${period.end} already exists.`);
  }
  const replacedEpisode = !PREPARE_ONLY && existingIndex >= 0 && REPLACE_EXISTING
    ? episodes.splice(existingIndex, 1)[0]
    : null;

  const [previous, players] = await Promise.all([
    fetchJson('getPreviousSessionsData'),
    fetchJson('getPlayers')
  ]);
  const allSessions = Array.isArray(previous.sessions_with_hands) ? previous.sessions_with_hands : [];
  const eloRows = Array.isArray(previous.elo_history_all) ? previous.elo_history_all : [];
  const playerNames = Object.fromEntries(players.map(player => [String(player.player_id), decodeHtml(player.username)]));
  const included = allSessions.filter(item => {
    if (!item?.session || !isOfficialCompleted(item.session)) return false;
    const date = ukDate(item.session.date_ended || item.session.date_started);
    return date >= period.start && date <= period.end;
  }).sort((a, b) => new Date(a.session.date_ended || a.session.date_started) - new Date(b.session.date_ended || b.session.date_started));
  if (!included.length) throw new Error(`No official completed sessions were found from ${period.start} to ${period.end}.`);

  const sessionFacts = included.map(item => summariseSession(item, playerNames, eloRows));
  const earlierFacts = allSessions.filter(item => {
    if (!item?.session || !isOfficialCompleted(item.session)) return false;
    return ukDate(item.session.date_ended || item.session.date_started) < period.start;
  }).sort((a, b) => new Date(a.session.date_ended || a.session.date_started) - new Date(b.session.date_ended || b.session.date_started))
    .map(item => summariseSession(item, playerNames, eloRows));
  const facts = {
    period,
    sessions: sessionFacts,
    relevant_previous_context: historicalContext(sessionFacts, earlierFacts),
    overall_elo_leaderboard_at_period_start: leaderboardAtEnd(players, allSessions, eloRows, isoDate(addDays(parseIsoDate(period.start, 'Period start'), -1))),
    overall_elo_leaderboard_at_period_end: leaderboardAtEnd(players, allSessions, eloRows, period.end)
  };

  if (PREPARE_ONLY) {
    const output = path.join(process.env.TEMP || '/tmp', `lockout-podcast-facts-${slugPeriod(period)}.json`);
    fs.writeFileSync(output, `${JSON.stringify(facts, null, 2)}\n`);
    console.log(JSON.stringify({ period, sessions: sessionFacts.length, notes: countNotes(sessionFacts), facts_file: output }, null, 2));
    return;
  }
  if (!API_KEY) throw new Error('GEMINI_API_KEY is not configured.');

  const draft = await generateDraft(facts);
  const number = episodeNumber(episodes);
  const stem = `episode-${String(number).padStart(2, '0')}-${slugPeriod(period)}`;
  const audioDir = path.join(ROOT, 'podcasts', 'audio');
  const transcriptDir = path.join(ROOT, 'podcasts', 'transcripts');
  fs.mkdirSync(audioDir, { recursive: true });
  fs.mkdirSync(transcriptDir, { recursive: true });
  const wavPath = path.join(process.env.TEMP || '/tmp', `${stem}.wav`);
  const audioRelative = path.posix.join('podcasts', 'audio', `${stem}.m4a`);
  const transcriptRelative = path.posix.join('podcasts', 'transcripts', `${stem}.txt`);
  await generateAudio(draft.transcript, wavPath);
  convertAudio(wavPath, path.join(ROOT, audioRelative));
  fs.writeFileSync(path.join(ROOT, transcriptRelative), `${draft.transcript}\n`);

  if (replacedEpisode?.audio_file && replacedEpisode.audio_file !== audioRelative) {
    const oldAudio = path.resolve(ROOT, replacedEpisode.audio_file);
    const audioRoot = `${path.resolve(ROOT, 'podcasts', 'audio')}${path.sep}`;
    if (oldAudio.startsWith(audioRoot)) fs.rmSync(oldAudio, { force: true });
  }

  episodes.unshift({
    title: `Episode ${number}: ${draft.title.replace(/^Episode\s+\d+\s*:\s*/i, '')}`,
    date: period.end,
    description: draft.description,
    audio_file: audioRelative
  });
  fs.writeFileSync(EPISODES_FILE, `${JSON.stringify(episodes, null, 2)}\n`);

  writeGitHubOutput({
    period: `${period.start} to ${period.end}`,
    audio_file: audioRelative,
    transcript_file: transcriptRelative
  });
  console.log(`Podcast generated for ${period.start} to ${period.end}: ${sessionFacts.length} sessions, ${countNotes(sessionFacts)} notes.`);
}

main().catch(error => {
  console.error(`Podcast generation failed: ${error.message}`);
  process.exitCode = 1;
});
