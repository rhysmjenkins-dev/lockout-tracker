// Lockout Tracker v2.1.1 - paste-ready Apps Script runtime bundle
// Generated from the modular files in apps-script/. Do not edit both copies.
// Migration.gs is intentionally excluded after the completed migration.
// ===== Code.gs =====
var V2_VERSION = '2.1.1';
var V2_READ_ACTIONS = {
getPlayers: true,
getSessions: true,
getRecentSessions: true,
getSession: true,
getHands: true,
getEditHistory: true,
getSessionsWithHands: true,
getHeadToHeadMatrix: true,
getPlayerComparisonDetailed: true,
getEloRatings: true,
getEloHistory: true,
getEloHistoryAll: true,
getPlayerProfile: true,
getStatsSummary: true,
checkPlayerPin: true,
getPublicConfig: true,
getHomeData: true,
getPreviousSessionsData: true,
getEloStatsData: true,
getSessionState: true,
getAppBootstrap: true
};
function doGet(e) {
var requestId = Utilities.getUuid();
var startedAt = Date.now();
try {
if (typeof v2ResetExecutionSheetCache === 'function') v2ResetExecutionSheetCache(true);
var params = (e && e.parameter) || {};
var action = String(params.action || '');
if (!V2_READ_ACTIONS[action]) {
return v2Respond({ error: 'This action is not available as a public read.', code: 'READ_ONLY' }, requestId);
}
var cached = v2ReadThroughCache(action, params, function() {
return v2RunRead(action, params);
});
if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
cached.server_ms = Date.now() - startedAt;
}
return v2Respond(cached, requestId);
} catch (err) {
console.error('Lockout v2 read error [' + requestId + ']: ' + String(err && err.stack || err));
return v2Respond({ error: 'The request could not be completed.', code: 'SERVER_ERROR' }, requestId);
}
}
function doPost(e) {
var requestId = Utilities.getUuid();
try {
if (typeof v2ResetExecutionSheetCache === 'function') v2ResetExecutionSheetCache(false);
var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
var payload = JSON.parse(raw);
var clientRequestId = String(payload.client_request_id || '').trim();
if (/^[A-Za-z0-9_-]{16,80}$/.test(clientRequestId)) requestId = clientRequestId;
var action = String(payload.action || '');
if (!action) throw v2Error('VALIDATION', 'Action is required.');
var result = v2RunMutation(action, payload, requestId);
if (v2MutationChangesReadData(action)) v2InvalidateReadCache();
return v2Respond(result, requestId);
} catch (err) {
var safe = v2NormaliseError(err);
if (safe.code === 'SERVER_ERROR') {
console.error('Lockout v2 write error [' + requestId + ']: ' + String(err && err.stack || err));
}
return v2Respond({ error: safe.message, code: safe.code }, requestId);
}
}
function v2RunRead(action, p) {
switch (action) {
case 'getPlayers': return v2GetPublicPlayers();
case 'getSessions': return v2VisibleSessions(getSessions());
case 'getRecentSessions': return v2VisibleSessions(getRecentSessions(v2OptionalLimit(p.limit)));
case 'getSession':
var session = getSession(v2Id(p.session_id, 'Session'));
if (session && String(session.status || '').toLowerCase() === 'void') throw v2Error('NOT_FOUND', 'Session not found.');
return session;
case 'getHands': return getHands(v2Id(p.session_id, 'Session'));
case 'getEditHistory': return getEditHistory(v2Text(p.record_type, 'Record type', 30), v2Id(p.record_id, 'Record'));
case 'getSessionsWithHands':
return getSessionsWithHands().filter(function(item) {
return !item.session || String(item.session.status || '').toLowerCase() !== 'void';
});
case 'getHeadToHeadMatrix': return getHeadToHeadMatrix();
case 'getPlayerComparisonDetailed':
return getPlayerComparisonDetailed(v2Id(p.player1_id, 'Player 1'), v2Id(p.player2_id, 'Player 2'));
case 'getEloRatings': return getEloRatings();
case 'getEloHistory': return getEloHistory(v2Id(p.player_id, 'Player'));
case 'getEloHistoryAll': return sheetToObjects('elo_history');
case 'getPlayerProfile': return getPlayerProfile(v2Id(p.player_id, 'Player'));
case 'getStatsSummary': return v2GetStatsSummary();
case 'checkPlayerPin': return v2CheckPlayerPin(v2Id(p.player_id, 'Player'));
case 'getHomeData':
return {
players: v2GetPublicPlayers(),
active_sessions_with_hands: v2GetActiveSessionsWithHands(),
elo_ratings: getEloRatings(),
public_config: v2GetPublicConfig()
};
case 'getPreviousSessionsData':
return {
sessions_with_hands: v2GetVisibleSessionsWithHands(),
elo_history_all: sheetToObjects('elo_history')
};
case 'getEloStatsData':
return {
elo_ratings: getEloRatings(),
sessions_with_hands: v2GetVisibleSessionsWithHands(),
elo_history_all: sheetToObjects('elo_history')
};
case 'getSessionState':
var stateSessionId = v2Id(p.session_id, 'Session');
var stateSession = getSession(stateSessionId);
if (!stateSession || stateSession.error ||
String(stateSession.status || '').toLowerCase() === 'void') {
throw v2Error('NOT_FOUND', 'Session not found.');
}
return {
session: stateSession,
hands: getHands(stateSessionId),
players: v2GetPublicPlayers()
};
case 'getAppBootstrap': return v2GetAppBootstrap();
case 'getPublicConfig': return v2GetPublicConfig();
default: throw v2Error('READ_ONLY', 'Unknown read action.');
}
}
function v2GetVisibleSessionsWithHands() {
return getSessionsWithHands().filter(function(item) {
return !item.session || String(item.session.status || '').toLowerCase() !== 'void';
});
}
function v2GetActiveSessionsWithHands() {
return v2GetVisibleSessionsWithHands().filter(function(item) {
if (!item.session) return false;
var ended = String(item.session.date_ended || '').trim();
return ended === '' || ended === 'null' || ended === 'undefined';
});
}
function v2GetAppBootstrap() {
var players = v2GetPublicPlayers();
return {
players: players,
sessions_with_hands: v2GetVisibleSessionsWithHands(),
elo_ratings: getEloRatings(),
elo_history_all: sheetToObjects('elo_history'),
stats_summary: v2GetStatsSummary(),
head_to_head_matrix: getHeadToHeadMatrix(),
public_config: v2GetPublicConfig(),
generated_at: new Date().toISOString()
};
}
function v2GetPublicPlayers() {
return getPlayers().map(function(player) {
var result = {};
Object.keys(player).forEach(function(key) {
if (!/^(pin_hash|pin_salt|pin_verifier|pin_version)$/.test(key)) result[key] = player[key];
});
result.has_pin = Boolean(String(player.pin_verifier || player.pin_hash || '').trim());
return result;
});
}
function v2GetPublicConfig() {
return {
version: V2_VERSION,
schema_version: PropertiesService.getScriptProperties().getProperty('SCHEMA_VERSION') || 'unconfigured',
photos_enabled: Boolean(PropertiesService.getScriptProperties().getProperty('IMGBB_API_KEY'))
};
}
var V2_READ_CACHE_SECONDS = {
getPlayers: 300,
getSessions: 120,
getRecentSessions: 120,
getSession: 5,
getHands: 5,
getSessionsWithHands: 120,
getHeadToHeadMatrix: 300,
getPlayerComparisonDetailed: 21600,
getEloRatings: 60,
getEloHistory: 300,
getEloHistoryAll: 300,
getPlayerProfile: 300,
getStatsSummary: 300,
getPublicConfig: 300,
getHomeData: 60,
getPreviousSessionsData: 300,
getEloStatsData: 300,
getSessionState: 5,
getAppBootstrap: 21600
};
function v2ReadThroughCache(action, params, loader) {
var ttl = Number(V2_READ_CACHE_SECONDS[action] || 0);
if (!ttl) return loader();
var cache = CacheService.getScriptCache();
var version = cache.get('v2:data-version') || '1';
var key = 'v2:' + version + ':' + action + ':' + v2StableCacheParams(params);
var cached = cache.get(key);
if (cached) {
try { return JSON.parse(cached); } catch (ignore) {}
}
var value = loader();
try {
var encoded = JSON.stringify(value);
if (encoded.length < 95000) cache.put(key, encoded, ttl);
} catch (ignore) {}
return value;
}
function v2StableCacheParams(params) {
var source = params || {};
var keys = Object.keys(source).filter(function(key) {
return key !== 'action' && key !== '_';
}).sort();
var safe = {};
keys.forEach(function(key) { safe[key] = String(source[key]); });
return Utilities.base64EncodeWebSafe(JSON.stringify(safe)).substring(0, 180);
}
function v2InvalidateReadCache() {
CacheService.getScriptCache().put('v2:data-version', Utilities.getUuid(), 21600);
}
function v2MutationChangesReadData(action) {
return {
setPlayerPin: true,
addPlayer: true,
createSession: true,
updateSession: true,
updateSessionPhoto: true,
addPlayerToSession: true,
closeSession: true,
addHand: true,
updateHand: true,
deleteHand: true,
updatePlayerProfile: true
}[action] === true;
}
function v2VisibleSessions(sessions) {
return (sessions || []).filter(function(session) {
return String(session.status || '').toLowerCase() !== 'void';
});
}
function v2GetStatsSummary() {
var players = getPlayers();
var stored = getSessionsWithHands().filter(function(item) {
return item.session && String(item.session.status || '').toLowerCase() !== 'void';
});
var allSessions = [];
var completedSessions = [];
stored.forEach(function(item) {
if (hasSessionTag(item.session, 'testing')) return;
var sessionData = {
session_id: item.session.session_id,
hands: item.hands || [],
player_join_info: item.session.player_join_info || '{}'
};
allSessions.push(sessionData);
if (item.session.date_ended && item.session.date_ended !== '') completedSessions.push(sessionData);
});
var stats = {};
players.forEach(function(player) {
stats[String(player.player_id)] = {
username: player.username,
sessionsWon: 0,
sessionsPlayed: 0,
handsWon: 0,
handsPlayed: 0,
totalScore: 0,
lockoutScores: [],
falseLockouts: 0,
falseLockoutScores: [],
totalLockouts: 0,
currentHandStreak: 0,
maxHandStreak: 0,
bestMargin: 0,
worstMargin: 0
};
});
var totalUniqueHands = 0;
allSessions.forEach(function(session) {
var playerUniqueHands = {};
players.forEach(function(player) {
playerUniqueHands[String(player.player_id)] = {};
});
var sessionHandNumbers = {};
session.hands.forEach(function(hand) {
var playerId = String(hand.player_id);
var player = stats[playerId];
if (!player) return;
player.totalScore += Number(hand.score || 0);
playerUniqueHands[playerId][String(Number(hand.hand_number))] = true;
sessionHandNumbers[String(Number(hand.hand_number))] = true;
if (hand.lockout_player_id && String(hand.lockout_player_id) === playerId) {
player.totalLockouts++;
var declarationScore = hand.lockout_score !== null &&
hand.lockout_score !== undefined && hand.lockout_score !== ''
? Number(hand.lockout_score)
: Number(hand.score || 0);
if (hand.false_lockout == 1 || hand.false_lockout === true || String(hand.false_lockout).toLowerCase() === 'true') {
player.falseLockouts++;
player.falseLockoutScores.push(declarationScore);
player.currentHandStreak = 0;
} else {
player.lockoutScores.push(declarationScore);
player.handsWon++;
player.currentHandStreak++;
player.maxHandStreak = Math.max(player.maxHandStreak, player.currentHandStreak);
}
} else {
player.currentHandStreak = 0;
}
});
Object.keys(playerUniqueHands).forEach(function(playerId) {
stats[playerId].handsPlayed += Object.keys(playerUniqueHands[playerId]).length;
});
totalUniqueHands += Object.keys(sessionHandNumbers).length;
});
completedSessions.forEach(function(session) {
var playerTotals = {};
var playersInSession = {};
session.hands.forEach(function(hand) {
playersInSession[String(hand.player_id)] = true;
});
try {
var joinInfo = JSON.parse(String(session.player_join_info || '{}'));
Object.keys(joinInfo).forEach(function(playerId) {
var item = joinInfo[playerId];
if (playersInSession[String(playerId)] &&
item && typeof item === 'object' && item.starting_score !== undefined) {
playerTotals[String(playerId)] = Number(item.starting_score || 0);
}
});
} catch (ignore) {}
session.hands.forEach(function(hand) {
var playerId = String(hand.player_id);
if (playerTotals[playerId] === undefined) playerTotals[playerId] = 0;
playerTotals[playerId] += Number(hand.score || 0);
});
Object.keys(playersInSession).forEach(function(playerId) {
if (stats[playerId]) stats[playerId].sessionsPlayed++;
});
var lowestScore = Infinity;
var winnerIds = [];
Object.keys(playerTotals).forEach(function(playerId) {
var score = playerTotals[playerId];
if (score < lowestScore) {
lowestScore = score;
winnerIds = [playerId];
} else if (score === lowestScore) {
winnerIds.push(playerId);
}
});
var secondLowestScore = Infinity;
Object.keys(playerTotals).forEach(function(playerId) {
var score = playerTotals[playerId];
if (score > lowestScore && score < secondLowestScore) secondLowestScore = score;
});
Object.keys(playerTotals).forEach(function(playerId) {
var player = stats[playerId];
if (!player) return;
if (winnerIds.indexOf(playerId) !== -1) {
player.sessionsWon += 1 / Math.max(1, winnerIds.length);
if (secondLowestScore !== Infinity) {
player.bestMargin = Math.max(player.bestMargin, secondLowestScore - lowestScore);
}
} else {
player.worstMargin = Math.max(player.worstMargin, playerTotals[playerId] - lowestScore);
}
});
});
stats._totalUniqueHands = totalUniqueHands;
return {
stats: stats,
total_sessions: completedSessions.length
};
}
function v2RunMutation(action, p, requestId) {
switch (action) {
case 'validatePlayer': return v2ValidatePlayer(p);
case 'verifyPlayerPin': return v2VerifyPlayerPin(p);
case 'setPlayerPin': return v2SetPlayerPin(p, requestId);
case 'addPlayer': return v2AddPlayer(p, requestId);
case 'createSession': return v2CreateSession(p, requestId);
case 'updateSession': return v2UpdateSession(p, requestId);
case 'updateSessionPhoto': return v2UpdateSessionPhoto(p, requestId);
case 'addPlayerToSession': return v2AddPlayerToSession(p, requestId);
case 'closeSession': return v2CloseSession(p, requestId);
case 'addHand': return v2AddHand(p, requestId);
case 'updateHand': return v2UpdateHand(p, requestId);
case 'deleteHand': return v2DeleteHand(p, requestId);
case 'updatePlayerProfile': return v2UpdatePlayerProfile(p, requestId);
case 'submitFeedback': return v2SubmitFeedback(p, requestId);
case 'uploadPhoto': return v2UploadPhoto(p, requestId);
default: throw v2Error('READ_ONLY', 'Unknown or administrator-only action.');
}
}
function v2Respond(data, requestId) {
var body = v2PublicSafe(data);
if (body && typeof body === 'object' && !Array.isArray(body)) body.request_id = requestId;
return ContentService.createTextOutput(JSON.stringify(body))
.setMimeType(ContentService.MimeType.JSON);
}
function v2PublicSafe(value, key) {
if (value === null || value === undefined) return value;
if (Object.prototype.toString.call(value) === '[object Date]') {
return isNaN(value.getTime()) ? null : value.toISOString();
}
if (Array.isArray(value)) {
return value.map(function(item) { return v2PublicSafe(item, key); });
}
if (typeof value === 'object') {
var out = {};
Object.keys(value).forEach(function(k) {
var issuedToken = k === 'player_token';
if (!issuedToken && /(^|_)(pin_hash|pin_salt|pin_verifier|edit_code_verifier|token|secret|password|pepper)($|_)/i.test(k)) return;
out[k] = v2PublicSafe(value[k], k);
});
return out;
}
if (typeof value !== 'string') return value;
var cleaned = value.charAt(0) === '\u200B' ? value.substring(1) : value;
if (key === 'player_join_info') return v2SafeJoinInfo(cleaned);
if (key === 'players_involved') return /^\d+(,\d+)*$/.test(cleaned) ? cleaned : '';
if (key === 'avatar_url' || key === 'photo_url' || key === 'url') {
return v2SafePublicUrl(cleaned);
}
return v2EscapeHtml(cleaned);
}
function v2SafeJoinInfo(value) {
try {
var parsed = JSON.parse(String(value || '{}'));
var safe = {};
Object.keys(parsed).forEach(function(playerId) {
if (!/^\d+$/.test(playerId)) return;
var item = parsed[playerId];
if (typeof item === 'number' && isFinite(item)) {
safe[playerId] = Math.max(1, Math.floor(item));
} else if (item && typeof item === 'object') {
safe[playerId] = {
hand: Math.max(1, Math.floor(Number(item.hand || 1))),
starting_score: Math.round(Number(item.starting_score || 0))
};
}
});
return JSON.stringify(safe);
} catch (err) {
return '{}';
}
}
function v2SafePublicUrl(value) {
var url = String(value || '').trim();
if (!url) return '';
if (!/^https:\/\//i.test(url)) return '';
if (/[\s"'<>\\]/.test(url)) return '';
return url.substring(0, 2000);
}
function v2EscapeHtml(value) {
return String(value)
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&#39;');
}
function v2Error(code, message) {
var err = new Error(message);
err.v2Code = code;
return err;
}
function v2NormaliseError(err) {
var allowed = {
VALIDATION: true,
AUTH_REQUIRED: true,
AUTH_EXPIRED: true,
MEMBER_LOCKED: true,
PROFILE_LOCKED: true,
SESSION_AUTH_REQUIRED: true,
SESSION_CONFLICT: true,
DATA_INTEGRITY: true,
NOT_FOUND: true,
SESSION_CLOSED: true,
DUPLICATE: true,
PHOTO_DISABLED: true,
PHOTO_INVALID: true,
READ_ONLY: true
};
var code = err && allowed[err.v2Code] ? err.v2Code : 'SERVER_ERROR';
var message = code === 'SERVER_ERROR' ? 'The request could not be completed.' : String(err.message || 'Request failed.');
return { code: code, message: message };
}
function v2OptionalLimit(value) {
if (value === undefined || value === null || value === '') return 20;
var n = Number(value);
if (!isFinite(n) || n < 1) throw v2Error('VALIDATION', 'Limit must be a positive number.');
return Math.min(Math.floor(n), 100);
}

// ===== Security.gs =====
var V2_PLAYER_TTL_SECONDS = 90 * 24 * 60 * 60;
function v2PlayerAuthVersion(playerId) {
return Number(
PropertiesService.getScriptProperties().getProperty('PROFILE_AUTH_VERSION_' + String(playerId)) || 1
);
}
function v2GlobalPlayerAuthVersion() {
return Number(
PropertiesService.getScriptProperties().getProperty('PLAYER_AUTH_VERSION') || 1
);
}
function v2IssuePlayerToken(player) {
return v2IssueToken('player', String(player.player_id), V2_PLAYER_TTL_SECONDS, {
label: String(player.username || 'Player'),
v: v2PlayerAuthVersion(player.player_id),
gv: v2GlobalPlayerAuthVersion()
});
}
function v2RequirePlayer(p, expectedPlayerId) {
var token = v2VerifyToken(String(p.player_token || ''), 'player');
if (expectedPlayerId !== undefined && String(token.sub) !== String(expectedPlayerId)) {
throw v2Error('AUTH_REQUIRED', 'Sign in as this player to edit their profile.');
}
if (Number(token.v || 1) !== v2PlayerAuthVersion(token.sub) ||
Number(token.gv || 1) !== v2GlobalPlayerAuthVersion()) {
throw v2Error('AUTH_EXPIRED', 'This saved sign-in has been reset. Please sign in again.');
}
var found = v2FindRow('players', 'player_id', token.sub);
if (!found) throw v2Error('AUTH_EXPIRED', 'This player no longer exists.');
token.label = String(found.object.username || token.label || 'Player');
token.player_id = String(found.object.player_id);
return token;
}
function v2ValidatePlayer(p) {
var player = v2RequirePlayer(p);
return {
success: true,
player_id: player.player_id,
username: player.label
};
}
function v2IssueToken(kind, subject, ttlSeconds, extra) {
var now = Math.floor(Date.now() / 1000);
var data = {
kind: kind,
sub: String(subject),
iat: now,
exp: now + ttlSeconds,
nonce: Utilities.getUuid()
};
Object.keys(extra || {}).forEach(function(key) { data[key] = extra[key]; });
var encoded = v2Base64Url(JSON.stringify(data));
return encoded + '.' + v2Sign(encoded);
}
function v2VerifyToken(raw, expectedKind, expectedSubject) {
if (!raw || raw.indexOf('.') < 1) throw v2Error('AUTH_REQUIRED', 'Sign in to make changes.');
var parts = raw.split('.');
if (parts.length !== 2 || !v2ConstantTimeEqual(parts[1], v2Sign(parts[0]))) {
throw v2Error('AUTH_REQUIRED', 'That saved sign-in is invalid.');
}
var data;
try {
data = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
} catch (err) {
throw v2Error('AUTH_REQUIRED', 'That saved sign-in is invalid.');
}
if (data.kind !== expectedKind) throw v2Error('AUTH_REQUIRED', 'That saved sign-in is invalid.');
if (expectedSubject !== undefined && String(data.sub) !== String(expectedSubject)) {
throw v2Error('AUTH_REQUIRED', 'That sign-in belongs to a different player.');
}
if (Number(data.exp) < Math.floor(Date.now() / 1000)) {
throw v2Error('AUTH_EXPIRED', 'Your saved sign-in has expired. Please sign in again.');
}
return data;
}
function v2Sign(encodedPayload) {
var secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET');
if (!secret) throw v2Error('SERVER_ERROR', 'Token security has not been configured.');
return Utilities.base64EncodeWebSafe(
Utilities.computeHmacSha256Signature(encodedPayload, secret)
).replace(/=+$/g, '');
}
function v2Base64Url(text) {
return Utilities.base64EncodeWebSafe(String(text)).replace(/=+$/g, '');
}
function v2Digest(text) {
return Utilities.base64EncodeWebSafe(
Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8)
).replace(/=+$/g, '');
}
function v2ConstantTimeEqual(a, b) {
a = String(a || '');
b = String(b || '');
var mismatch = a.length ^ b.length;
var length = Math.max(a.length, b.length);
for (var i = 0; i < length; i++) {
mismatch |= (a.charCodeAt(i % Math.max(1, a.length)) || 0) ^
(b.charCodeAt(i % Math.max(1, b.length)) || 0);
}
return mismatch === 0;
}
function v2CheckPlayerPin(playerId) {
var found = v2FindRow('players', 'player_id', playerId);
if (!found) throw v2Error('NOT_FOUND', 'Player not found.');
return { success: true, has_pin: Boolean(String(found.object.pin_verifier || '').trim()) };
}
function v2SetPlayerPin(p, requestId) {
var playerId = v2Id(p.player_id, 'Player');
var pin = String(p.pin || '');
if (!/^\d{4}$/.test(pin)) throw v2Error('VALIDATION', 'Choose a four-digit PIN.');
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
var found = v2FindRow('players', 'player_id', playerId);
if (!found) throw v2Error('NOT_FOUND', 'Player not found.');
if (String(found.object.pin_verifier || '').trim()) {
throw v2Error('AUTH_REQUIRED', 'This player already has a PIN. Ask the administrator to reset it if needed.');
}
var salt = Utilities.getUuid();
v2SetRowValues(found.sheet, found.rowNumber, found.headers, {
pin_hash: '',
pin_salt: salt,
pin_verifier: v2HashPin(pin, salt),
pin_version: 3,
profile_updated_at: v2Timestamp()
});
v2AppendAudit(
requestId,
found.object.username || ('Player ' + playerId),
'player',
'SET_PIN',
'player',
playerId,
'',
playerId
);
return {
success: true,
player_id: playerId,
username: String(found.object.username || 'Player'),
player_token: v2IssuePlayerToken(found.object)
};
} finally {
lock.releaseLock();
}
}
function v2VerifyPlayerPin(p) {
var playerId = v2Id(p.player_id, 'Player');
var pin = String(p.pin || '');
if (!/^\d{4}$/.test(pin)) throw v2Error('VALIDATION', 'Enter your four-digit PIN.');
var found = v2FindRow('players', 'player_id', playerId);
if (!found) throw v2Error('NOT_FOUND', 'Player not found.');
if (!String(found.object.pin_verifier || '').trim()) {
throw v2Error('AUTH_REQUIRED', 'This player has not chosen a PIN yet.');
}
var verified = v2ConstantTimeEqual(
String(found.object.pin_verifier),
v2HashPin(pin, String(found.object.pin_salt || ''))
);
if (!verified) return { success: false };
return {
success: true,
player_id: playerId,
username: String(found.object.username || 'Player'),
player_token: v2IssuePlayerToken(found.object)
};
}
function v2HashPin(pin, salt) {
var secret = PropertiesService.getScriptProperties().getProperty('TOKEN_SECRET') || '';
return Utilities.base64EncodeWebSafe(
Utilities.computeHmacSha256Signature(String(pin) + '|' + String(salt), secret)
).replace(/=+$/g, '');
}

// ===== Mutations.gs =====
function v2AddPlayer(p, requestId) {
var player = v2RequirePlayer(p);
var username = v2Text(p.username, 'Player name', 50);
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
var existing = sheetToObjects('players');
for (var i = 0; i < existing.length; i++) {
if (String(existing[i].username || '').toLowerCase() === username.toLowerCase()) {
throw v2Error('DUPLICATE', 'A player with that name already exists.');
}
}
var sheet = getSheet('players');
var headers = v2Headers(sheet);
var id = getNextId('players');
v2AppendObject(sheet, headers, {
player_id: id,
username: v2SheetText(username),
date_joined: v2Timestamp(),
avatar_url: '',
bio: '',
pin_hash: '',
pin_salt: '',
pin_verifier: '',
pin_version: '',
profile_updated_at: ''
});
v2AppendAudit(requestId, player.label, 'player', 'ADDED_PLAYER', 'player', id, '', player.player_id);
return { success: true, player_id: id };
} finally {
lock.releaseLock();
}
}
function v2CreateSession(p, requestId) {
var player = v2RequirePlayer(p);
var title = v2Text(p.title, 'Session title', 100);
var hostId = v2Id(p.host_player_id, 'Host player');
var playerIds = v2IdList(p.players_involved, 'Players');
if (playerIds.length < 2) throw v2Error('VALIDATION', 'Select at least two players.');
if (playerIds.indexOf(String(hostId)) === -1) throw v2Error('VALIDATION', 'The host must be included in the session.');
var notes = v2OptionalText(p.notes, 'Notes', 1000);
var tags = v2OptionalText(p.tags, 'Tags', 250);
var penaltyValue = p.false_lockout_penalty;
var penalty = v2Integer(
penaltyValue === '' || penaltyValue === null || penaltyValue === undefined
? DEFAULT_FALSE_LOCKOUT_PENALTY
: penaltyValue,
'False-lockout penalty',
0,
100
);
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
v2AssertPlayersExist(playerIds);
var existing = sheetToObjects('sessions');
for (var i = 0; i < existing.length; i++) {
if (String(existing[i].title || '').toLowerCase().trim() === title.toLowerCase()) {
throw v2Error('DUPLICATE', 'A session with that title already exists.');
}
}
var sheet = getSheet('sessions');
var headers = v2Headers(sheet);
var id = getNextId('sessions');
v2AppendObject(sheet, headers, {
session_id: id,
title: v2SheetText(title),
host_player_id: hostId,
players_involved: playerIds.join(','),
date_started: v2Timestamp(),
date_ended: '',
notes: v2SheetText(notes),
tags: v2SheetText(tags),
player_join_info: '{}',
false_lockout_penalty: penalty,
photo_url: '',
status: 'active',
revision: 1,
auth_version: 1,
edit_code_verifier: '',
updated_at: v2Timestamp()
});
var titleColumn = headers.indexOf('title') + 1;
if (titleColumn > 0) {
sheet.getRange(sheet.getLastRow(), titleColumn)
.setNumberFormat('@')
.setValue(v2SheetText(title));
}
v2AppendAudit(requestId, player.label, 'player', 'CREATED', 'session', id, '', player.player_id);
return {
success: true,
session_id: id,
revision: 1
};
} finally {
lock.releaseLock();
}
}
function v2UpdateSession(p, requestId) {
var notes = v2OptionalText(p.notes, 'Notes', 1000);
var tags = v2OptionalText(p.tags, 'Tags', 250);
return v2MutateSession(p, requestId, 'UPDATED', function(context) {
v2SetRowValues(context.sheet, context.rowNumber, context.headers, {
notes: v2SheetText(notes),
tags: v2SheetText(tags)
});
return {};
});
}
function v2UpdateSessionPhoto(p, requestId) {
var photoUrl = p.photo_url ? v2HttpsUrl(p.photo_url, 'Photo URL') : '';
return v2MutateSession(p, requestId, 'UPDATED_PHOTO', function(context) {
v2SetRowValues(context.sheet, context.rowNumber, context.headers, { photo_url: photoUrl });
return {};
});
}
function v2AddPlayerToSession(p, requestId) {
var playerId = v2Id(p.player_id, 'Player');
var joinHand = v2Integer(p.join_hand_number, 'Join hand number', 1, 10000);
return v2MutateSession(p, requestId, 'ADDED_PLAYER_TO_SESSION', function(context) {
v2AssertPlayersExist([String(playerId)]);
var players = v2IdList(context.object.players_involved, 'Players');
if (players.indexOf(String(playerId)) !== -1) throw v2Error('DUPLICATE', 'Player is already in this session.');
var nextHand = v2NextHandNumber(context.id);
if (joinHand !== nextHand) throw v2Error('SESSION_CONFLICT', 'Late joiners must start on the next hand.');
var startingScore = v2StartingScoreBeforeHand(context.object, context.id, joinHand);
players.push(String(playerId));
var joinInfo = v2ParsePlayerJoinInfo(context.object);
joinInfo[String(playerId)] = { hand: joinHand, starting_score: startingScore };
v2SetRowValues(context.sheet, context.rowNumber, context.headers, {
players_involved: players.join(','),
player_join_info: JSON.stringify(joinInfo)
});
return {
players_involved: players.join(','),
player_join_info: JSON.stringify(joinInfo),
starting_score: startingScore
};
});
}
function v2CloseSession(p, requestId) {
var lock = LockService.getScriptLock();
lock.waitLock(30000);
try {
var result = v2MutateSession(p, requestId, 'CLOSED', function(context) {
if (v2NextHandNumber(context.id) <= 1) throw v2Error('VALIDATION', 'Add at least one hand before closing the session.');
var finalScores = v2GetFinalSessionScores(context.object, context.id);
v2SetRowValues(context.sheet, context.rowNumber, context.headers, {
date_ended: v2Timestamp(),
status: 'completed'
});
return { final_scores: finalScores };
}, true);
SpreadsheetApp.flush();
try {
calculateEloForSessionUnlocked(v2Id(p.session_id, 'Session'));
} catch (eloErr) {
console.error('Elo calculation failed after closing session ' + p.session_id + ': ' + String(eloErr));
result.elo_warning = 'The session closed, but Elo needs recalculating by the administrator.';
}
return result;
} finally {
lock.releaseLock();
}
}
function v2AddHand(p, requestId) {
var result = v2WriteHand(p, requestId, false);
result.hands = getHands(v2Id(p.session_id, 'Session'));
return result;
}
function v2UpdateHand(p, requestId) {
return v2WriteHand(p, requestId, true);
}
function v2WriteHand(p, requestId, isUpdate) {
var handNumber = v2Integer(p.hand_number, 'Hand number', 1, 10000);
var prepared = null;
return v2MutateSession(p, requestId, isUpdate ? 'UPDATED_HAND' : 'ADDED_HAND', function(context) {
var nextHand = v2NextHandNumber(context.id);
if (!isUpdate && handNumber !== nextHand) {
throw v2Error('SESSION_CONFLICT', 'Another hand was saved first. Reload the session.');
}
if (isUpdate && (handNumber >= nextHand || !v2HandExists(context.id, handNumber))) {
throw v2Error('NOT_FOUND', 'That hand no longer exists.');
}
prepared = v2PrepareHand(context.object, handNumber, p);
var handSheet = getSheet('hands');
var existingRows = isUpdate ? v2ExistingHandRows(handSheet, context.id, handNumber) : {};
var nextId = isUpdate ? 0 : getNextId('hands');
var rows = [];
for (var i = 0; i < prepared.scores.length; i++) {
var score = prepared.scores[i];
var isLockout = String(score.player_id) === prepared.lockoutPlayerId;
var existing = existingRows[String(score.player_id)];
if (isUpdate && !existing) throw v2Error('DATA_INTEGRITY', 'The stored hand is incomplete. Ask the administrator to run validation.');
rows.push([
isUpdate ? existing.hand_id : nextId++,
context.id,
handNumber,
score.player_id,
score.score,
isLockout ? prepared.lockoutPlayerId : '',
isLockout && prepared.falseLockout ? 1 : 0,
v2SheetText(prepared.comment),
isLockout ? prepared.rawLockoutScore : ''
]);
}
if (rows.length) {
if (isUpdate) {
if (Object.keys(existingRows).length !== rows.length) {
throw v2Error('DATA_INTEGRITY', 'The stored hand has duplicate or unexpected players. Ask the administrator to run validation.');
}
v2ReplaceHandRows(handSheet, existingRows, rows);
} else {
handSheet.getRange(handSheet.getLastRow() + 1, 1, rows.length, 9).setValues(rows);
}
}
var recalculatedJoinInfo = v2RecalculateLateJoinStartingScores(context.object, context.id);
if (recalculatedJoinInfo !== String(context.object.player_join_info || '{}')) {
v2SetRowValues(context.sheet, context.rowNumber, context.headers, {
player_join_info: recalculatedJoinInfo
});
}
return {
hand_number: handNumber,
false_lockout: prepared.falseLockout,
lockout_score: prepared.rawLockoutScore
};
});
}
function v2GetFinalSessionScores(session, sessionId) {
var hands = getHands(sessionId);
var joinInfo = parseJoinInfo(session);
var totals = {};
for (var i = 0; i < hands.length; i++) {
var playerId = String(hands[i].player_id);
if (totals[playerId] === undefined) totals[playerId] = Number(joinInfo[playerId] || 0);
totals[playerId] += Number(hands[i].score || 0);
}
return Object.keys(totals).map(function(playerId) {
return { player_id: playerId, total: totals[playerId] };
}).sort(function(a, b) {
if (a.total !== b.total) return a.total - b.total;
return Number(a.player_id) - Number(b.player_id);
});
}
function v2ExistingHandRows(sheet, sessionId, handNumber) {
var data = sheet.getDataRange().getValues();
var result = {};
for (var i = 1; i < data.length; i++) {
if (String(data[i][1]) !== String(sessionId) || Number(data[i][2]) !== Number(handNumber)) continue;
var playerId = String(data[i][3]);
if (result[playerId]) {
throw v2Error('DATA_INTEGRITY', 'The stored hand contains a duplicate player.');
}
result[playerId] = { row_number: i + 1, hand_id: data[i][0] };
}
return result;
}
function v2ReplaceHandRows(sheet, existingRows, replacementRows) {
var rowNumbers = Object.keys(existingRows).map(function(playerId) {
return Number(existingRows[playerId].row_number);
}).sort(function(a, b) { return a - b; });
if (!rowNumbers.length) return;
var firstRow = rowNumbers[0];
var lastRow = rowNumbers[rowNumbers.length - 1];
var range = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, 9);
var values = range.getValues();
replacementRows.forEach(function(row) {
var playerId = String(row[3]);
var existing = existingRows[playerId];
if (!existing) {
throw v2Error('DATA_INTEGRITY', 'The stored hand is incomplete. Ask the administrator to run validation.');
}
values[Number(existing.row_number) - firstRow] = row;
});
range.setValues(values);
}
function v2DeleteHand(p, requestId) {
var handNumber = v2Integer(p.hand_number, 'Hand number', 1, 10000);
return v2MutateSession(p, requestId, 'DELETED_HAND', function(context) {
var latest = v2NextHandNumber(context.id) - 1;
if (handNumber !== latest || latest < 1) {
throw v2Error('SESSION_CONFLICT', 'Only the latest hand can be deleted.');
}
v2DeleteHandRows(getSheet('hands'), context.id, handNumber);
var recalculatedJoinInfo = v2RecalculateLateJoinStartingScores(context.object, context.id);
if (recalculatedJoinInfo !== String(context.object.player_join_info || '{}')) {
v2SetRowValues(context.sheet, context.rowNumber, context.headers, {
player_join_info: recalculatedJoinInfo
});
}
return { hand_number: handNumber };
});
}
function v2UpdatePlayerProfile(p, requestId) {
var playerId = v2Id(p.player_id, 'Player');
var player = v2RequirePlayer(p, playerId);
var avatarUrl = p.avatar_url ? v2HttpsUrl(p.avatar_url, 'Avatar URL') : '';
var bio = v2OptionalText(p.bio, 'Bio', 500);
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
var found = v2FindRow('players', 'player_id', playerId);
if (!found) throw v2Error('NOT_FOUND', 'Player not found.');
v2SetRowValues(found.sheet, found.rowNumber, found.headers, {
avatar_url: avatarUrl,
bio: v2SheetText(bio),
profile_updated_at: v2Timestamp()
});
v2AppendAudit(requestId, player.label, 'player', 'UPDATED_PROFILE', 'player', playerId, '', player.player_id);
return { success: true };
} finally {
lock.releaseLock();
}
}
function v2SubmitFeedback(p, requestId) {
var player = v2RequirePlayer(p);
var type = v2OptionalText(p.type || 'Other', 'Feedback type', 30);
var message = v2Text(p.message, 'Feedback message', 2000);
var submittedBy = v2OptionalText(p.submitted_by || player.label, 'Name', 50);
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
var sheet = getSheet('feedback');
var headers = v2Headers(sheet);
var feedbackId = getNextId('feedback');
var values = {
timestamp: v2Timestamp(),
type: v2SheetText(type),
message: v2SheetText(message),
submitted_by: v2SheetText(submittedBy)
};
values[headers[0]] = feedbackId;
v2AppendObject(sheet, headers, values);
v2AppendAudit(requestId, player.label, 'player', 'SUBMITTED_FEEDBACK', 'feedback', feedbackId, '', player.player_id);
return { success: true };
} finally {
lock.releaseLock();
}
}
function v2UploadPhoto(p) {
var scope = String(p.scope || '');
if (scope === 'profile') {
v2RequirePlayer(p, v2Id(p.player_id, 'Player'));
} else if (scope === 'session') {
v2Id(p.session_id, 'Session');
v2RequirePlayer(p);
} else if (scope === 'new_session') {
v2RequirePlayer(p);
} else {
throw v2Error('VALIDATION', 'Photo scope is invalid.');
}
var key = PropertiesService.getScriptProperties().getProperty('IMGBB_API_KEY');
if (!key) throw v2Error('PHOTO_DISABLED', 'Photo uploads are not configured yet.');
var mime = String(p.mime_type || '').toLowerCase();
if (['image/jpeg', 'image/png', 'image/webp', 'image/gif'].indexOf(mime) === -1) {
throw v2Error('PHOTO_INVALID', 'Use a JPEG, PNG, WebP, or GIF image.');
}
var base64 = String(p.image_base64 || '').replace(/^data:[^;]+;base64,/, '');
if (!base64 || base64.length > 7000000 || !/^[A-Za-z0-9+/_=-]+$/.test(base64)) {
throw v2Error('PHOTO_INVALID', 'The image must be 5 MB or smaller.');
}
var response = UrlFetchApp.fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(key), {
method: 'post',
payload: {
image: base64,
name: v2OptionalText(p.file_name || 'lockout-photo', 'File name', 80)
},
muteHttpExceptions: true
});
if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) {
throw v2Error('PHOTO_INVALID', 'The photo host rejected the upload.');
}
var parsed = JSON.parse(response.getContentText());
if (!parsed.success || !parsed.data || !parsed.data.url) {
throw v2Error('PHOTO_INVALID', 'The photo could not be uploaded.');
}
return { success: true, url: v2HttpsUrl(parsed.data.url, 'Uploaded photo URL') };
}
function v2FindSessionMutationReplay(requestId, action, sessionId) {
if (!requestId || !action || !sessionId) return null;
var entries = sheetToObjects('edit_history');
for (var i = entries.length - 1; i >= 0; i--) {
var entry = entries[i];
if (String(entry.request_id || '') !== String(requestId)) continue;
if (String(entry.action || '') !== String(action)) continue;
if (String(entry.record_type || '') !== 'session') continue;
if (String(entry.record_id || '') !== String(sessionId)) continue;
var details = {};
try { details = JSON.parse(String(entry.details || '{}')); } catch (ignore) {}
var replay = {
success: true,
revision: Number(details.revision || 1),
replayed: true
};
if (details.hand_number !== null && details.hand_number !== undefined) {
replay.hand_number = Number(details.hand_number);
}
if (action === 'ADDED_HAND') replay.hands = getHands(sessionId);
return replay;
}
return null;
}
function v2MutateSession(p, requestId, action, callback, lockAlreadyHeld) {
var sessionId = v2Id(p.session_id, 'Session');
var expectedRevision = v2Integer(p.revision, 'Session revision', 1, 1000000000);
var lock = null;
if (!lockAlreadyHeld) {
lock = LockService.getScriptLock();
lock.waitLock(10000);
}
try {
var replay = p.client_request_id && String(p.client_retry || '') === '1'
? v2FindSessionMutationReplay(requestId, action, sessionId)
: null;
if (replay) return replay;
var found = v2FindRow('sessions', 'session_id', sessionId);
if (!found) throw v2Error('NOT_FOUND', 'Session not found.');
if (String(found.object.status || '').toLowerCase() === 'void') throw v2Error('SESSION_CLOSED', 'This session has been voided.');
if (isSessionCompleted(found.object)) throw v2Error('SESSION_CLOSED', 'This session is already closed.');
var player = v2RequirePlayer(p);
var currentRevision = Number(found.object.revision || 1);
if (expectedRevision !== currentRevision) {
throw v2Error('SESSION_CONFLICT', 'This session changed on another device. Reload it before editing.');
}
var context = {
id: sessionId,
sheet: found.sheet,
rowNumber: found.rowNumber,
headers: found.headers,
object: found.object
};
var extra = callback(context) || {};
var newRevision = currentRevision + 1;
v2SetRowValues(found.sheet, found.rowNumber, found.headers, {
revision: newRevision,
updated_at: v2Timestamp()
});
try {
v2AppendAudit(
requestId,
player.label,
'player',
action,
'session',
sessionId,
JSON.stringify({ revision: newRevision, hand_number: extra.hand_number || null }),
player.player_id
);
} catch (auditError) {
console.error('Audit append failed after session mutation ' + sessionId + ': ' + String(auditError));
extra.audit_warning = 'The game change was saved, but its activity-log entry could not be written.';
}
extra.success = true;
extra.revision = newRevision;
return extra;
} finally {
if (lock) lock.releaseLock();
}
}
function v2PrepareHand(session, handNumber, p) {
var rawScores = p.scores;
if (typeof rawScores === 'string') {
try { rawScores = JSON.parse(rawScores); } catch (err) { throw v2Error('VALIDATION', 'Scores are invalid.'); }
}
if (!Array.isArray(rawScores)) throw v2Error('VALIDATION', 'Scores are required.');
var lockoutPlayerId = String(v2Id(p.lockout_player_id, 'Lockout player'));
var expectedPlayers = v2PlayersForHand(session, handNumber);
var byPlayer = {};
for (var i = 0; i < rawScores.length; i++) {
var pid = String(v2Id(rawScores[i].player_id, 'Score player'));
if (byPlayer[pid] !== undefined) throw v2Error('VALIDATION', 'A player appears twice in the hand.');
byPlayer[pid] = v2Integer(rawScores[i].score, 'Score', -2, 1000);
}
if (Object.keys(byPlayer).length !== expectedPlayers.length) throw v2Error('VALIDATION', 'Enter one score for every active player.');
for (var j = 0; j < expectedPlayers.length; j++) {
if (byPlayer[expectedPlayers[j]] === undefined) throw v2Error('VALIDATION', 'Scores do not match the active players.');
}
if (expectedPlayers.indexOf(lockoutPlayerId) === -1) throw v2Error('VALIDATION', 'Lockout player is not active in this hand.');
var rawLockout = v2Integer(
p.lockout_score !== undefined && p.lockout_score !== '' ? p.lockout_score : byPlayer[lockoutPlayerId],
'Lockout score',
-2,
1000
);
byPlayer[lockoutPlayerId] = rawLockout;
var lowest = Infinity;
var lowestCount = 0;
Object.keys(byPlayer).forEach(function(pid) {
if (byPlayer[pid] < lowest) { lowest = byPlayer[pid]; lowestCount = 1; }
else if (byPlayer[pid] === lowest) lowestCount++;
});
var falseLockout = rawLockout > 5 || rawLockout !== lowest || lowestCount !== 1;
var storedPenalty = session.false_lockout_penalty;
var penalty = v2Integer(
storedPenalty === '' || storedPenalty === null || storedPenalty === undefined
? DEFAULT_FALSE_LOCKOUT_PENALTY
: storedPenalty,
'False-lockout penalty',
0,
100
);
byPlayer[lockoutPlayerId] = falseLockout ? rawLockout + penalty : (rawLockout < 0 ? rawLockout : 0);
return {
scores: expectedPlayers.map(function(pid) { return { player_id: pid, score: byPlayer[pid] }; }),
lockoutPlayerId: lockoutPlayerId,
rawLockoutScore: rawLockout,
falseLockout: falseLockout,
comment: v2OptionalText(p.comment, 'Hand comment', 500)
};
}
function v2PlayersForHand(session, handNumber) {
var players = v2IdList(session.players_involved, 'Players');
var joinInfo = v2ParsePlayerJoinInfo(session);
return players.filter(function(pid) {
return !joinInfo[pid] || Number(joinInfo[pid].hand || 1) <= handNumber;
});
}
function v2NextHandNumber(sessionId) {
var hands = getHands(sessionId);
var max = 0;
for (var i = 0; i < hands.length; i++) max = Math.max(max, Number(hands[i].hand_number || 0));
return max + 1;
}
function v2HandExists(sessionId, handNumber) {
var hands = getHands(sessionId);
for (var i = 0; i < hands.length; i++) {
if (Number(hands[i].hand_number) === Number(handNumber)) return true;
}
return false;
}
function v2DeleteHandRows(sheet, sessionId, handNumber) {
var data = sheet.getDataRange().getValues();
var rows = [];
for (var i = 1; i < data.length; i++) {
if (String(data[i][1]) === String(sessionId) && Number(data[i][2]) === Number(handNumber)) rows.push(i + 1);
}
for (var j = rows.length - 1; j >= 0; j--) sheet.deleteRow(rows[j]);
}
function v2StartingScoreBeforeHand(session, sessionId, handNumber) {
var hands = getHands(sessionId);
var joinInfo = v2ParsePlayerJoinInfo(session);
var totals = {};
for (var i = 0; i < hands.length; i++) {
if (Number(hands[i].hand_number) >= handNumber) continue;
var pid = String(hands[i].player_id);
if (totals[pid] === undefined) {
totals[pid] = joinInfo[pid] ? Number(joinInfo[pid].starting_score || 0) : 0;
}
totals[pid] += Number(hands[i].score);
}
var ids = Object.keys(totals);
if (!ids.length) return 0;
var sum = ids.reduce(function(total, id) { return total + totals[id]; }, 0);
return Math.round(sum / ids.length);
}
function v2ParsePlayerJoinInfo(session) {
var parsed;
try {
parsed = JSON.parse(String(session.player_join_info || '{}'));
} catch (err) {
throw v2Error('DATA_INTEGRITY', 'Late-join data is invalid. Ask the administrator to run validation.');
}
if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
throw v2Error('DATA_INTEGRITY', 'Late-join data is invalid. Ask the administrator to run validation.');
}
var result = {};
Object.keys(parsed).forEach(function(playerId) {
if (!/^\d+$/.test(String(playerId))) {
throw v2Error('DATA_INTEGRITY', 'Late-join data contains an invalid player.');
}
var item = parsed[playerId];
if (typeof item === 'number') {
result[String(playerId)] = {
hand: v2Integer(item, 'Join hand number', 1, 10000),
starting_score: 0
};
return;
}
if (!item || typeof item !== 'object' || Array.isArray(item)) {
throw v2Error('DATA_INTEGRITY', 'Late-join data contains an invalid entry.');
}
result[String(playerId)] = {
hand: v2Integer(item.hand || 1, 'Join hand number', 1, 10000),
starting_score: v2Integer(
item.starting_score === '' || item.starting_score === null || item.starting_score === undefined
? 0
: item.starting_score,
'Join starting score',
-1000000,
1000000
)
};
});
return result;
}
function v2RecalculateLateJoinStartingScores(session, sessionId) {
var joinInfo = v2ParsePlayerJoinInfo(session);
var joinerIds = Object.keys(joinInfo);
if (!joinerIds.length) return '{}';
var hands = getHands(sessionId);
var handsByNumber = {};
hands.forEach(function(hand) {
var handNumber = Number(hand.hand_number);
if (!handsByNumber[handNumber]) handsByNumber[handNumber] = [];
handsByNumber[handNumber].push(hand);
});
var joinersByHand = {};
var maxJoinHand = 1;
joinerIds.forEach(function(playerId) {
var joinHand = Number(joinInfo[playerId].hand);
if (!joinersByHand[joinHand]) joinersByHand[joinHand] = [];
joinersByHand[joinHand].push(playerId);
maxJoinHand = Math.max(maxJoinHand, joinHand);
});
var totals = {};
var played = {};
for (var handNumber = 1; handNumber <= maxJoinHand; handNumber++) {
var joiningNow = joinersByHand[handNumber] || [];
if (joiningNow.length) {
var activeIds = Object.keys(played);
var startingScore = 0;
if (activeIds.length) {
var total = activeIds.reduce(function(sum, playerId) {
return sum + Number(totals[playerId] || 0);
}, 0);
startingScore = Math.round(total / activeIds.length);
}
joiningNow.forEach(function(playerId) {
joinInfo[playerId].starting_score = startingScore;
totals[playerId] = startingScore;
});
}
(handsByNumber[handNumber] || []).forEach(function(hand) {
var playerId = String(hand.player_id);
if (totals[playerId] === undefined) {
totals[playerId] = joinInfo[playerId] ? Number(joinInfo[playerId].starting_score || 0) : 0;
}
totals[playerId] += Number(hand.score || 0);
played[playerId] = true;
});
}
return JSON.stringify(joinInfo);
}
function v2AssertPlayersExist(ids) {
var players = sheetToObjects('players');
var known = {};
players.forEach(function(player) { known[String(player.player_id)] = true; });
ids.forEach(function(id) {
if (!known[String(id)]) throw v2Error('VALIDATION', 'A selected player no longer exists.');
});
}
function v2FindRow(sheetName, idHeader, id) {
var sheet = getSheet(sheetName);
var values = sheet.getDataRange().getValues();
if (!values.length) return null;
var headers = values[0].map(function(value) { return String(value); });
var idIndex = headers.indexOf(idHeader);
if (idIndex < 0) throw new Error('Missing header: ' + idHeader);
for (var row = 1; row < values.length; row++) {
if (String(values[row][idIndex]) === String(id)) {
var object = {};
headers.forEach(function(header, index) { object[header] = values[row][index]; });
return { sheet: sheet, headers: headers, rowNumber: row + 1, object: object };
}
}
return null;
}
function v2Headers(sheet) {
if (sheet.getLastColumn() < 1) throw new Error('Sheet has no headers: ' + sheet.getName());
return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(value) { return String(value); });
}
function v2SetRowValues(sheet, rowNumber, headers, valuesByHeader) {
var indexes = {};
Object.keys(valuesByHeader).forEach(function(header) {
var index = headers.indexOf(header);
if (index < 0) throw new Error('Run migrateLockoutV2Beta(); missing header: ' + header);
indexes[header] = index;
});
var range = sheet.getRange(rowNumber, 1, 1, headers.length);
var row = range.getValues()[0];
Object.keys(valuesByHeader).forEach(function(header) {
row[indexes[header]] = valuesByHeader[header];
});
range.setValues([row]);
}
function v2AppendObject(sheet, headers, valuesByHeader) {
var row = headers.map(function(header) {
return valuesByHeader[header] !== undefined ? valuesByHeader[header] : '';
});
sheet.appendRow(row);
}
function v2AppendAudit(requestId, actor, actorType, action, recordType, recordId, details, actorPlayerId) {
var sheet = getSheet('edit_history');
var headers = v2Headers(sheet);
var idHeader = headers.indexOf('edit_id') >= 0 ? 'edit_id' : headers[0];
var values = {};
values[idHeader] = getNextId('edit_history');
values.timestamp = v2Timestamp();
values.editor_name = v2SheetText(v2OptionalText(actor || 'Unknown', 'Audit actor', 80));
values.action = action;
values.record_type = recordType;
values.record_id = recordId;
values.request_id = requestId;
values.actor_type = actorType;
values.actor_player_id = actorPlayerId || '';
values.details = v2SheetText(v2OptionalText(details, 'Audit details', 1000));
v2AppendObject(sheet, headers, values);
}
function v2Id(value, label) {
var text = String(value === undefined || value === null ? '' : value).trim();
if (!/^\d+$/.test(text) || Number(text) < 1) throw v2Error('VALIDATION', label + ' ID is invalid.');
return text;
}
function v2IdList(value, label) {
var values = Array.isArray(value) ? value : String(value || '').split(',');
var output = [];
values.forEach(function(item) {
var id = String(v2Id(item, label));
if (output.indexOf(id) === -1) output.push(id);
});
if (!output.length) throw v2Error('VALIDATION', label + ' are required.');
return output;
}
function v2Integer(value, label, min, max) {
var number = Number(value);
if (!isFinite(number) || Math.floor(number) !== number || number < min || number > max) {
throw v2Error('VALIDATION', label + ' must be a whole number from ' + min + ' to ' + max + '.');
}
return number;
}
function v2Text(value, label, maxLength) {
var text = String(value === undefined || value === null ? '' : value).trim();
if (!text) throw v2Error('VALIDATION', label + ' is required.');
if (text.length > maxLength) throw v2Error('VALIDATION', label + ' is too long.');
if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) throw v2Error('VALIDATION', label + ' contains unsupported characters.');
return text;
}
function v2OptionalText(value, label, maxLength) {
if (value === undefined || value === null || String(value).trim() === '') return '';
return v2Text(value, label, maxLength);
}
function v2SheetText(value) {
var text = String(value === undefined || value === null ? '' : value);
return /^[=+\-@]/.test(text) ? '\u200B' + text : text;
}
function v2HttpsUrl(value, label) {
var url = String(value || '').trim();
if (!/^https:\/\//i.test(url) || /[\s"'<>\\]/.test(url) || url.length > 2000) {
throw v2Error('VALIDATION', label + ' must be a valid HTTPS URL.');
}
return url;
}
function v2Timestamp() {
return new Date().toISOString();
}

// ===== LegacyCore.gs =====
var DEFAULT_ELO = 1000;
var PROVISIONAL_HANDS = 50;
var PROVISIONAL_K = 40;
var STANDARD_K = 24;
var DEFAULT_FALSE_LOCKOUT_PENALTY = 10;
var V2_EXECUTION_SHEET_CACHE = {};
var V2_EXECUTION_SHEET_CACHE_ENABLED = false;
function getSheet(name) {
var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
if (!sheet) throw new Error('Sheet "' + name + '" not found.');
return sheet;
}
function getNextId(sheetName) {
var sheet = getSheet(sheetName);
var lastRow = sheet.getLastRow();
if (lastRow <= 1) return 1;
var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
var maxId = 0;
for (var i = 0; i < data.length; i++) {
var val = Number(data[i][0]);
if (val > maxId) maxId = val;
}
return maxId + 1;
}
function sheetToObjects(sheetName) {
if (V2_EXECUTION_SHEET_CACHE_ENABLED && V2_EXECUTION_SHEET_CACHE[sheetName]) {
return V2_EXECUTION_SHEET_CACHE[sheetName];
}
var sheet = getSheet(sheetName);
var data = sheet.getDataRange().getValues();
if (data.length <= 1) return [];
var headers = data[0];
var result = [];
for (var i = 1; i < data.length; i++) {
var obj = {};
for (var j = 0; j < headers.length; j++) {
var value = data[i][j];
if (headers[j] === 'title' && value instanceof Date && !isNaN(value.getTime())) {
value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'dd/MM/yy');
}
obj[headers[j]] = (value === '' || value === null || value === undefined) ? '' : value;
}
result.push(obj);
}
if (V2_EXECUTION_SHEET_CACHE_ENABLED) V2_EXECUTION_SHEET_CACHE[sheetName] = result;
return result;
}
function v2ResetExecutionSheetCache(enabled) {
V2_EXECUTION_SHEET_CACHE = {};
V2_EXECUTION_SHEET_CACHE_ENABLED = enabled === true;
}
function isSessionCompleted(session) {
if (String(session.status || '').toLowerCase() === 'void') return false;
var dateEnded = String(session.date_ended || '').trim();
return dateEnded !== '' && dateEnded !== 'null' && dateEnded !== 'undefined';
}
function hasSessionTag(session, tag) {
var wanted = String(tag || '').trim().toLowerCase();
if (!wanted) return false;
return String(session.tags || '').split(',').some(function(value) {
return String(value).trim().toLowerCase() === wanted;
});
}
function isOfficialCompletedSession(session) {
return isSessionCompleted(session) && !hasSessionTag(session, 'testing');
}
function parseJoinInfo(session) {
try {
if (!session.player_join_info || session.player_join_info === '' || session.player_join_info === '{}') return {};
var parsed = JSON.parse(session.player_join_info);
var result = {};
for (var pid in parsed) {
var info = parsed[pid];
if (typeof info === 'object' && info.starting_score !== undefined) {
result[String(pid)] = Number(info.starting_score);
}
}
return result;
} catch (e) {
return {};
}
}
function getSessionPlayedPlayerIds(session, sessionHands) {
var played = {};
(sessionHands || []).forEach(function(hand) {
played[String(hand.player_id)] = true;
});
var result = String(session.players_involved || '').split(',').map(function(playerId) {
return String(playerId).trim();
}).filter(function(playerId, index, values) {
return playerId && played[playerId] && values.indexOf(playerId) === index;
});
Object.keys(played).forEach(function(playerId) {
if (result.indexOf(playerId) === -1) result.push(playerId);
});
return result;
}
function findSessionById(sessions, sessionId) {
for (var i = 0; i < sessions.length; i++) {
if (String(sessions[i].session_id) === String(sessionId)) return sessions[i];
}
return null;
}
function buildCompletedSessionIdsBefore(sessions, beforeDate, excludeSessionId) {
var map = {};
for (var i = 0; i < sessions.length; i++) {
var s = sessions[i];
if (!isOfficialCompletedSession(s)) continue;
if (String(s.session_id) === String(excludeSessionId)) continue;
if (new Date(s.date_started) < beforeDate) {
map[String(s.session_id)] = true;
}
}
return map;
}
function countHandsInSessions(hands, playerId, sessionIdMap) {
var seen = {};
for (var i = 0; i < hands.length; i++) {
var hand = hands[i];
if (String(hand.player_id) === String(playerId) && sessionIdMap[String(hand.session_id)]) {
seen[hand.session_id + '_' + hand.hand_number] = true;
}
}
return Object.keys(seen).length;
}
function getLockoutScore(hand) {
return (hand.lockout_score !== null && hand.lockout_score !== undefined && hand.lockout_score !== '')
? Number(hand.lockout_score)
: Number(hand.score);
}
function getPlayers() {
return sheetToObjects('players');
}
function getSessions() {
return sheetToObjects('sessions');
}
function getRecentSessions(limit) {
var sessions = sheetToObjects('sessions');
sessions.sort(function (a, b) { return new Date(b.date_started) - new Date(a.date_started); });
var maxLimit = limit ? Math.min(Number(limit), sessions.length) : 20;
return sessions.slice(0, maxLimit);
}
function getSession(sessionId) {
var session = findSessionById(sheetToObjects('sessions'), sessionId);
return session || { error: 'Session not found' };
}
function getHands(sessionId) {
var all = sheetToObjects('hands');
var result = [];
for (var i = 0; i < all.length; i++) {
if (String(all[i].session_id) === String(sessionId)) result.push(all[i]);
}
return result;
}
function getEditHistory(recordType, recordId) {
var all = sheetToObjects('edit_history');
var result = [];
for (var i = 0; i < all.length; i++) {
if (String(all[i].record_type) === String(recordType) && String(all[i].record_id) === String(recordId)) {
result.push(all[i]);
}
}
return result;
}
function getSessionsWithHands() {
var sessions = sheetToObjects('sessions');
var allHands = sheetToObjects('hands');
var handsBySession = {};
for (var i = 0; i < allHands.length; i++) {
var sid = String(allHands[i].session_id);
if (!handsBySession[sid]) handsBySession[sid] = [];
handsBySession[sid].push(allHands[i]);
}
var result = [];
for (var i = 0; i < sessions.length; i++) {
var sid = String(sessions[i].session_id);
result.push({ session: sessions[i], hands: handsBySession[sid] || [] });
}
return result;
}
function getHeadToHeadMatrix() {
var sessions = sheetToObjects('sessions');
var hands = sheetToObjects('hands');
var handsBySession = {};
for (var i = 0; i < hands.length; i++) {
var sid = String(hands[i].session_id);
if (!handsBySession[sid]) handsBySession[sid] = [];
handsBySession[sid].push(hands[i]);
}
var h2h = {};
for (var i = 0; i < sessions.length; i++) {
var session = sessions[i];
if (!isOfficialCompletedSession(session)) continue;
var joinInfo = parseJoinInfo(session);
var sessionHands = handsBySession[String(session.session_id)] || [];
var playerIds = getSessionPlayedPlayerIds(session, sessionHands);
if (playerIds.length < 2) continue;
var playerTotals = {};
for (var p = 0; p < playerIds.length; p++) {
var pid = String(playerIds[p].trim());
playerTotals[pid] = joinInfo[pid] || 0;
}
for (var h = 0; h < sessionHands.length; h++) {
var pid = String(sessionHands[h].player_id);
if (playerTotals[pid] !== undefined) playerTotals[pid] += Number(sessionHands[h].score);
}
for (var p1 = 0; p1 < playerIds.length; p1++) {
for (var p2 = p1 + 1; p2 < playerIds.length; p2++) {
var id1 = String(playerIds[p1]);
var id2 = String(playerIds[p2]);
var key = id1 < id2 ? id1 + '_' + id2 : id2 + '_' + id1;
if (!h2h[key]) {
h2h[key] = {
p1: id1 < id2 ? id1 : id2,
p2: id1 < id2 ? id2 : id1,
p1_wins: 0, p2_wins: 0, ties: 0, sessions_together: 0
};
}
h2h[key].sessions_together++;
var score1 = playerTotals[id1];
var score2 = playerTotals[id2];
if (score1 < score2) {
if (id1 === h2h[key].p1) h2h[key].p1_wins++; else h2h[key].p2_wins++;
} else if (score2 < score1) {
if (id2 === h2h[key].p1) h2h[key].p1_wins++; else h2h[key].p2_wins++;
} else {
h2h[key].ties++;
}
}
}
}
return Object.values(h2h);
}
function getEloRatings() {
var history = sheetToObjects('elo_history');
var hands = sheetToObjects('hands');
var sessions = sheetToObjects('sessions');
var latest = {};
for (var i = 0; i < history.length; i++) {
var pid = String(history[i].player_id);
if (!latest[pid] || Number(history[i].elo_id) > Number(latest[pid].elo_id)) {
latest[pid] = history[i];
}
}
var completedIds = {};
for (var i = 0; i < sessions.length; i++) {
if (isOfficialCompletedSession(sessions[i])) completedIds[String(sessions[i].session_id)] = true;
}
var players = sheetToObjects('players');
var result = [];
for (var i = 0; i < players.length; i++) {
var pid = String(players[i].player_id);
var handsPlayed = countHandsInSessions(hands, pid, completedIds);
result.push({
player_id: pid,
username: players[i].username,
rating: latest[pid] ? Math.round(Number(latest[pid].new_rating)) : DEFAULT_ELO,
change: latest[pid] ? Math.round(Number(latest[pid].change)) : 0,
provisional: handsPlayed < PROVISIONAL_HANDS,
hands_played: handsPlayed
});
}
result.sort(function (a, b) { return b.rating - a.rating; });
return result;
}
function getEloHistory(playerId) {
var history = sheetToObjects('elo_history');
var result = [];
for (var i = 0; i < history.length; i++) {
if (String(history[i].player_id) === String(playerId)) result.push(history[i]);
}
result.sort(function (a, b) { return Number(a.elo_id) - Number(b.elo_id); });
return result;
}
function calculateEloForSession(sessionId) {
var lock = LockService.getScriptLock();
lock.waitLock(30000);
try {
return calculateEloForSessionUnlocked(sessionId);
} finally {
lock.releaseLock();
}
}
function calculateEloForSessionUnlocked(sessionId) {
var sessions = sheetToObjects('sessions');
var hands = sheetToObjects('hands');
var targetSession = findSessionById(sessions, sessionId);
if (!targetSession) return { error: 'Session not found' };
if (hasSessionTag(targetSession, 'testing')) return { skipped: true, reason: 'Testing session' };
if (!isSessionCompleted(targetSession)) return { error: 'Session not closed yet' };
var eloHistory = sheetToObjects('elo_history');
for (var i = 0; i < eloHistory.length; i++) {
if (String(eloHistory[i].session_id) === String(sessionId)) {
return { skipped: true, reason: 'ELO already calculated for this session' };
}
}
var joinInfo = parseJoinInfo(targetSession);
var targetHands = hands.filter(function(hand) {
return String(hand.session_id) === String(sessionId);
});
var playerIds = getSessionPlayedPlayerIds(targetSession, targetHands);
var playerTotals = {};
for (var i = 0; i < playerIds.length; i++) {
var pid = String(playerIds[i].trim());
playerTotals[pid] = joinInfo[pid] || 0;
}
for (var i = 0; i < targetHands.length; i++) {
var pid = String(targetHands[i].player_id);
if (playerTotals[pid] !== undefined) playerTotals[pid] += Number(targetHands[i].score);
}
var sortedPlayers = Object.keys(playerTotals).sort(function (a, b) {
return playerTotals[a] - playerTotals[b];
});
var n = sortedPlayers.length;
if (n < 2) return { skipped: true, reason: 'Not enough players' };
var actualScores = {};
var i = 0;
while (i < n) {
var j = i;
while (j < n - 1 && playerTotals[sortedPlayers[j]] === playerTotals[sortedPlayers[j + 1]]) j++;
var avgBeaten = 0;
for (var k = i; k <= j; k++) avgBeaten += (n - 1 - k);
avgBeaten = avgBeaten / (j - i + 1);
var actualScore = avgBeaten / (n - 1);
for (var k = i; k <= j; k++) actualScores[sortedPlayers[k]] = actualScore;
i = j + 1;
}
var currentRatings = {};
for (var i = 0; i < eloHistory.length; i++) {
var pid = String(eloHistory[i].player_id);
if (!currentRatings[pid] || Number(eloHistory[i].elo_id) > Number(currentRatings[pid].elo_id)) {
currentRatings[pid] = eloHistory[i];
}
}
var ratings = {};
for (var i = 0; i < sortedPlayers.length; i++) {
var pid = sortedPlayers[i];
ratings[pid] = currentRatings[pid] ? Number(currentRatings[pid].new_rating) : DEFAULT_ELO;
}
var ratedSessionIds = {};
for (var i = 0; i < eloHistory.length; i++) {
ratedSessionIds[String(eloHistory[i].session_id)] = true;
}
var handsPlayedCache = {};
for (var i = 0; i < sortedPlayers.length; i++) {
var pid = sortedPlayers[i];
handsPlayedCache[pid] = countHandsInSessions(hands, pid, ratedSessionIds);
}
var ratingChanges = {};
for (var i = 0; i < sortedPlayers.length; i++) ratingChanges[sortedPlayers[i]] = 0;
for (var a = 0; a < sortedPlayers.length; a++) {
for (var b = a + 1; b < sortedPlayers.length; b++) {
var pidA = sortedPlayers[a];
var pidB = sortedPlayers[b];
var expectedA = 1 / (1 + Math.pow(10, (ratings[pidB] - ratings[pidA]) / 400));
var expectedB = 1 - expectedA;
var kA = handsPlayedCache[pidA] < PROVISIONAL_HANDS ? PROVISIONAL_K : STANDARD_K;
var kB = handsPlayedCache[pidB] < PROVISIONAL_HANDS ? PROVISIONAL_K : STANDARD_K;
ratingChanges[pidA] += kA * (actualScores[pidA] - expectedA);
ratingChanges[pidB] += kB * (actualScores[pidB] - expectedB);
}
}
var eloSheet = getSheet('elo_history');
var nextId = getNextId('elo_history');
var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
var rowsToAdd = [];
for (var i = 0; i < sortedPlayers.length; i++) {
var pid = sortedPlayers[i];
var oldRating = ratings[pid];
var change = ratingChanges[pid] / (n - 1);
var newRating = oldRating + change;
rowsToAdd.push([nextId, sessionId, pid, Math.round(oldRating), Math.round(newRating), Math.round(change), date]);
nextId++;
}
if (rowsToAdd.length > 0) {
eloSheet.getRange(eloSheet.getLastRow() + 1, 1, rowsToAdd.length, 7).setValues(rowsToAdd);
}
return { success: true, ratings: rowsToAdd };
}
function recalculateAllElo() {
var lock = LockService.getScriptLock();
lock.waitLock(30000);
try {
var eloSheet = getSheet('elo_history');
var lastRow = eloSheet.getLastRow();
if (lastRow > 1) eloSheet.deleteRows(2, lastRow - 1);
var sessions = sheetToObjects('sessions');
var completed = sessions.filter(function (s) {
return isOfficialCompletedSession(s);
});
completed.sort(function (a, b) {
var difference = v2EloSequenceTime(a) - v2EloSequenceTime(b);
return difference || Number(a.session_id) - Number(b.session_id);
});
for (var i = 0; i < completed.length; i++) {
calculateEloForSessionUnlocked(completed[i].session_id);
}
if (typeof v2InvalidateReadCache === 'function') v2InvalidateReadCache();
return { success: true, sessions_processed: completed.length };
} finally {
lock.releaseLock();
}
}
function v2EloSequenceTime(session) {
var ended = new Date(session.date_ended);
if (!isNaN(ended.getTime())) return ended.getTime();
var started = new Date(session.date_started);
return isNaN(started.getTime()) ? 0 : started.getTime();
}
function getPlayerComparisonDetailed(player1Id, player2Id) {
var sessions = sheetToObjects('sessions');
var hands = sheetToObjects('hands');
var handsBySession = {};
for (var i = 0; i < hands.length; i++) {
var sid = String(hands[i].session_id);
if (!handsBySession[sid]) handsBySession[sid] = [];
handsBySession[sid].push(hands[i]);
}
var sessionsTogetherData = [];
var allSessionsData = { player1: [], player2: [] };
for (var i = 0; i < sessions.length; i++) {
var session = sessions[i];
if (!isOfficialCompletedSession(session)) continue;
var joinInfo = parseJoinInfo(session);
var sessionHands = handsBySession[String(session.session_id)] || [];
var allPlayerIds = getSessionPlayedPlayerIds(session, sessionHands);
var p1InSession = allPlayerIds.indexOf(String(player1Id)) !== -1;
var p2InSession = allPlayerIds.indexOf(String(player2Id)) !== -1;
if (!p1InSession && !p2InSession) continue;
var playerTotals = {};
for (var p = 0; p < allPlayerIds.length; p++) {
var pid = String(allPlayerIds[p].trim());
playerTotals[pid] = joinInfo[pid] || 0;
}
var p1Hands = [], p2Hands = [];
for (var h = 0; h < sessionHands.length; h++) {
var hand = sessionHands[h];
var pid = String(hand.player_id);
if (playerTotals[pid] !== undefined) playerTotals[pid] += Number(hand.score);
if (pid === String(player1Id)) p1Hands.push(hand);
if (pid === String(player2Id)) p2Hands.push(hand);
}
var lowestScore = Infinity;
for (var pid in playerTotals) {
if (playerTotals[pid] < lowestScore) lowestScore = playerTotals[pid];
}
var winners = [];
for (var pid in playerTotals) {
if (playerTotals[pid] === lowestScore) winners.push(pid);
}
if (p1InSession && p2InSession) {
var p1Score = playerTotals[String(player1Id)] || 0;
var p2Score = playerTotals[String(player2Id)] || 0;
sessionsTogetherData.push({
session_id: session.session_id,
title: session.title,
date: session.date_started,
player_count: allPlayerIds.length,
other_players: allPlayerIds.filter(function (pid) {
return String(pid) !== String(player1Id) && String(pid) !== String(player2Id);
}),
p1_won: p1Score < p2Score,
p2_won: p2Score < p1Score,
is_tie: p1Score === p2Score,
p1_score: p1Score,
p2_score: p2Score,
p1_hands: p1Hands,
p2_hands: p2Hands
});
}
if (p1InSession) {
allSessionsData.player1.push({
session_id: session.session_id, title: session.title, date: session.date_started,
player_count: allPlayerIds.length,
p1_won: winners.indexOf(String(player1Id)) !== -1,
is_tie: winners.length > 1 && winners.indexOf(String(player1Id)) !== -1,
p1_score: playerTotals[String(player1Id)] || 0,
p1_hands: p1Hands
});
}
if (p2InSession) {
allSessionsData.player2.push({
session_id: session.session_id, title: session.title, date: session.date_started,
player_count: allPlayerIds.length,
p2_won: winners.indexOf(String(player2Id)) !== -1,
is_tie: winners.length > 1 && winners.indexOf(String(player2Id)) !== -1,
p2_score: playerTotals[String(player2Id)] || 0,
p2_hands: p2Hands
});
}
}
return {
player1_id: player1Id,
player2_id: player2Id,
sessions_together: sessionsTogetherData,
sessions_together_stats: calculateDetailedComparisonStats(sessionsTogetherData, player1Id, player2Id),
all_sessions_player1: allSessionsData.player1,
all_sessions_player2: allSessionsData.player2,
all_sessions_stats: {
player1: calculateDetailedPlayerStats(allSessionsData.player1, player1Id),
player2: calculateDetailedPlayerStats(allSessionsData.player2, player2Id)
}
};
}
function calculateDetailedComparisonStats(sessionsData, player1Id, player2Id) {
var p1Wins = 0, p2Wins = 0, ties = 0;
var p1TotalScore = 0, p2TotalScore = 0, p1TotalHands = 0, p2TotalHands = 0;
var p1Lockouts = 0, p2Lockouts = 0;
var p1LockoutScores = [], p2LockoutScores = [];
var p1FalseLockouts = 0, p2FalseLockouts = 0;
var p1FalseLockoutScores = [], p2FalseLockoutScores = [];
var p1TotalLockouts = 0, p2TotalLockouts = 0;
var contextMap = {};
for (var i = 0; i < sessionsData.length; i++) {
var s = sessionsData[i];
if (s.p1_won && !s.p2_won) p1Wins++;
else if (s.p2_won && !s.p1_won) p2Wins++;
else if (s.is_tie) ties++;
for (var h = 0; h < s.p1_hands.length; h++) {
var hand = s.p1_hands[h];
p1TotalScore += Number(hand.score);
p1TotalHands++;
if (hand.lockout_player_id && String(hand.lockout_player_id) === String(player1Id)) {
p1TotalLockouts++;
var ls = getLockoutScore(hand);
if (hand.false_lockout == 1 || hand.false_lockout === true) { p1FalseLockouts++; p1FalseLockoutScores.push(ls); }
else { p1Lockouts++; p1LockoutScores.push(ls); }
}
}
for (var h = 0; h < s.p2_hands.length; h++) {
var hand = s.p2_hands[h];
p2TotalScore += Number(hand.score);
p2TotalHands++;
if (hand.lockout_player_id && String(hand.lockout_player_id) === String(player2Id)) {
p2TotalLockouts++;
var ls = getLockoutScore(hand);
if (hand.false_lockout == 1 || hand.false_lockout === true) { p2FalseLockouts++; p2FalseLockoutScores.push(ls); }
else { p2Lockouts++; p2LockoutScores.push(ls); }
}
}
for (var j = 0; j < s.other_players.length; j++) {
var otherId = s.other_players[j];
if (!contextMap[otherId]) contextMap[otherId] = { p1_wins: 0, total: 0 };
contextMap[otherId].total++;
if (s.p1_won && !s.p2_won) contextMap[otherId].p1_wins++;
}
}
var totalSessions = p1Wins + p2Wins + ties;
var bestWith = null, worstWith = null;
if (Object.keys(contextMap).length >= 2) {
var bestRate = -1, worstRate = 101;
for (var otherId in contextMap) {
var ctx = contextMap[otherId];
var rate = ctx.total > 0 ? (ctx.p1_wins / ctx.total) * 100 : 0;
if (rate > bestRate) { bestRate = rate; bestWith = { player_id: otherId, wins: ctx.p1_wins, total: ctx.total }; }
if (rate < worstRate) { worstRate = rate; worstWith = { player_id: otherId, wins: ctx.p1_wins, total: ctx.total }; }
}
}
function avg(arr) { return arr.length > 0 ? (arr.reduce(function(a,b){return a+b;},0) / arr.length).toFixed(2) : 'N/A'; }
return {
p1_wins: p1Wins, p2_wins: p2Wins, ties: ties, total_sessions: totalSessions,
p1_win_rate: totalSessions > 0 ? ((p1Wins / totalSessions) * 100).toFixed(1) : '0',
p2_win_rate: totalSessions > 0 ? ((p2Wins / totalSessions) * 100).toFixed(1) : '0',
p1_total_score: p1TotalScore, p2_total_score: p2TotalScore,
p1_total_hands: p1TotalHands, p2_total_hands: p2TotalHands,
p1_avg_hand: p1TotalHands > 0 ? (p1TotalScore / p1TotalHands).toFixed(2) : '0',
p2_avg_hand: p2TotalHands > 0 ? (p2TotalScore / p2TotalHands).toFixed(2) : '0',
p1_lockouts: p1Lockouts, p2_lockouts: p2Lockouts,
p1_lockout_rate: p1TotalHands > 0 ? ((p1Lockouts / p1TotalHands) * 100).toFixed(1) : '0',
p2_lockout_rate: p2TotalHands > 0 ? ((p2Lockouts / p2TotalHands) * 100).toFixed(1) : '0',
p1_avg_lockout: avg(p1LockoutScores.concat(p1FalseLockoutScores)), p2_avg_lockout: avg(p2LockoutScores.concat(p2FalseLockoutScores)),
p1_false_lockouts: p1FalseLockouts, p2_false_lockouts: p2FalseLockouts,
p1_false_lockout_rate: p1TotalLockouts > 0 ? ((p1FalseLockouts / p1TotalLockouts) * 100).toFixed(1) : '0',
p2_false_lockout_rate: p2TotalLockouts > 0 ? ((p2FalseLockouts / p2TotalLockouts) * 100).toFixed(1) : '0',
p1_avg_false_lockout: avg(p1FalseLockoutScores), p2_avg_false_lockout: avg(p2FalseLockoutScores),
best_with: bestWith, worst_with: worstWith
};
}
function calculateDetailedPlayerStats(sessionsData, playerId) {
var wins = 0, ties = 0, totalScore = 0, totalHands = 0;
var lockouts = 0, lockoutScores = [], falseLockouts = 0, falseLockoutScores = [], totalLockouts = 0;
for (var i = 0; i < sessionsData.length; i++) {
var s = sessionsData[i];
if (s.is_tie) ties++;
else if (s.p1_won || s.p2_won) wins++;
var handsArray = s.p1_hands || s.p2_hands || [];
for (var h = 0; h < handsArray.length; h++) {
var hand = handsArray[h];
totalScore += Number(hand.score);
totalHands++;
if (hand.lockout_player_id && String(hand.lockout_player_id) === String(playerId)) {
totalLockouts++;
var ls = getLockoutScore(hand);
if (hand.false_lockout == 1 || hand.false_lockout === true) { falseLockouts++; falseLockoutScores.push(ls); }
else { lockouts++; lockoutScores.push(ls); }
}
}
}
var totalSessions = sessionsData.length;
function avg(arr) { return arr.length > 0 ? (arr.reduce(function(a,b){return a+b;},0) / arr.length).toFixed(2) : 'N/A'; }
return {
wins: wins, losses: totalSessions - wins - ties, ties: ties, total_sessions: totalSessions,
win_rate: totalSessions > 0 ? ((wins / totalSessions) * 100).toFixed(1) : '0',
total_score: totalScore, total_hands: totalHands,
avg_hand: totalHands > 0 ? (totalScore / totalHands).toFixed(2) : '0',
lockouts: lockouts,
lockout_rate: totalHands > 0 ? ((lockouts / totalHands) * 100).toFixed(1) : '0',
avg_lockout: avg(lockoutScores.concat(falseLockoutScores)),
false_lockouts: falseLockouts,
false_lockout_rate: totalLockouts > 0 ? ((falseLockouts / totalLockouts) * 100).toFixed(1) : '0',
avg_false_lockout: avg(falseLockoutScores)
};
}
function getPlayerProfile(playerId) {
if (!playerId) return { error: 'Missing player ID' };
var sessions = sheetToObjects('sessions');
var hands = sheetToObjects('hands');
var eloHistory = sheetToObjects('elo_history');
var players = sheetToObjects('players');
var player = null;
for (var i = 0; i < players.length; i++) {
if (String(players[i].player_id) === String(playerId)) {
player = players[i];
break;
}
}
if (!player) return { error: 'Player not found' };
var handsBySession = {};
for (var i = 0; i < hands.length; i++) {
var sid = String(hands[i].session_id);
if (!handsBySession[sid]) handsBySession[sid] = [];
handsBySession[sid].push(hands[i]);
}
var playerSessions = [];
for (var i = 0; i < sessions.length; i++) {
var s = sessions[i];
if (!isOfficialCompletedSession(s)) continue;
var playerIds = getSessionPlayedPlayerIds(s, handsBySession[String(s.session_id)] || []);
var inSession = playerIds.indexOf(String(playerId)) !== -1;
if (inSession) playerSessions.push(s);
}
playerSessions.sort(function(a, b) { return new Date(b.date_started) - new Date(a.date_started); });
var totalHandsPlayed = 0;
var totalScore = 0;
var totalLockouts = 0;
var totalFalseLockouts = 0;
var lockoutScores = [];
var falseLockoutScoresArr = [];
var sessionsWon = 0;
var sessionsPlayed = playerSessions.length;
var maxStreakEver = 0;
var currentStreak = 0;
var rockBottomEarned = false;
var hustlerEarned = false;
var hatTrickEarned = false;
var unstoppableEarned = false;
var overconfidentCount = 0;
var overconfidentEarned = false;
var strategistEarned = false;
var highRollerCount = 0;
var highRollerEarned = false;
var bloodbathEarned = false;
var slowBurnerEarned = false;
var perfectHandEarned = false;
var ghostSessionsCount = 0;
var ghostEarned = false;
var lightningRoundEarned = false;
var nemesisMap = {}; // opponent -> consecutive wins
var h2hMap = {};
for (var s = 0; s < playerSessions.length; s++) {
var session = playerSessions[s];
var sid = String(session.session_id);
var sessionHands = handsBySession[sid] || [];
var joinInfo = parseJoinInfo(session);
var allPlayerIds = getSessionPlayedPlayerIds(session, sessionHands);
var playerTotals = {};
for (var p = 0; p < allPlayerIds.length; p++) {
var pid = String(allPlayerIds[p]);
playerTotals[pid] = joinInfo[pid] || 0;
}
for (var h = 0; h < sessionHands.length; h++) {
var hand = sessionHands[h];
var pid = String(hand.player_id);
if (playerTotals[pid] !== undefined) playerTotals[pid] += Number(hand.score);
}
var lowestScore = Infinity;
for (var pid in playerTotals) {
if (playerTotals[pid] < lowestScore) lowestScore = playerTotals[pid];
}
var winners = [];
for (var pid in playerTotals) {
if (playerTotals[pid] === lowestScore) winners.push(String(pid));
}
var playerWon = winners.indexOf(String(playerId)) !== -1 && winners.length === 1;
if (winners.indexOf(String(playerId)) !== -1) sessionsWon += 1 / winners.length;
if (playerTotals[String(playerId)] !== undefined && playerTotals[String(playerId)] < 0) rockBottomEarned = true;
if (playerWon && joinInfo[String(playerId)] !== undefined) hustlerEarned = true;
var handNums = new Set();
for (var h = 0; h < sessionHands.length; h++) handNums.add(sessionHands[h].hand_number);
if (handNums.size > 0 && handNums.size < 10) lightningRoundEarned = true;
var playerHandsThisSession = [];
for (var h = 0; h < sessionHands.length; h++) {
if (String(sessionHands[h].player_id) === String(playerId)) {
playerHandsThisSession.push(sessionHands[h]);
}
}
totalHandsPlayed += playerHandsThisSession.length;
var sessionLockouts = 0;
var sessionAttemptedLockout = false;
var playerFalseLockoutMap = {};
for (var h = 0; h < sessionHands.length; h++) {
var hand = sessionHands[h];
if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
if (hand.false_lockout == 1 || hand.false_lockout === true) {
playerFalseLockoutMap[String(hand.player_id)] = true;
}
}
}
var allHadFalseLockout = allPlayerIds.length > 1;
for (var p = 0; p < allPlayerIds.length; p++) {
if (!playerFalseLockoutMap[String(allPlayerIds[p])]) { allHadFalseLockout = false; break; }
}
if (allHadFalseLockout) bloodbathEarned = true;
for (var h = 0; h < playerHandsThisSession.length; h++) {
var hand = playerHandsThisSession[h];
totalScore += Number(hand.score);
if (hand.lockout_player_id && String(hand.lockout_player_id) === String(playerId)) {
sessionAttemptedLockout = true;
var ls = getLockoutScore(hand);
if (ls === 5) highRollerCount++;
if (hand.false_lockout == 1 || hand.false_lockout === true) {
totalFalseLockouts++;
falseLockoutScoresArr.push(ls);
currentStreak = 0;
if (ls > 5) overconfidentCount++;
} else {
totalLockouts++;
lockoutScores.push(ls);
sessionLockouts++;
currentStreak++;
if (currentStreak > maxStreakEver) maxStreakEver = currentStreak;
if (ls <= 0) perfectHandEarned = true;
}
} else {
currentStreak = 0;
}
}
if (sessionLockouts >= 3) hatTrickEarned = true;
if (sessionLockouts >= 5) unstoppableEarned = true;
if (!sessionAttemptedLockout) ghostSessionsCount++;
if (playerWon && sessionLockouts === 0 && !sessionAttemptedLockout) slowBurnerEarned = true;
if (playerWon) {
var lockoutAttemptsByPlayer = {};
allPlayerIds.forEach(function(id) {
lockoutAttemptsByPlayer[String(id)] = 0;
});
for (var h = 0; h < sessionHands.length; h++) {
var hand = sessionHands[h];
if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
var pid = String(hand.player_id);
lockoutAttemptsByPlayer[pid] = (lockoutAttemptsByPlayer[pid] || 0) + 1;
}
}
var myAttempts = lockoutAttemptsByPlayer[String(playerId)] || 0;
var fewestAttempts = Math.min.apply(null, Object.keys(lockoutAttemptsByPlayer).map(function(id) {
return Number(lockoutAttemptsByPlayer[id] || 0);
}));
if (myAttempts === fewestAttempts) strategistEarned = true;
}
var opponents = allPlayerIds.filter(function(pid) { return String(pid) !== String(playerId); });
for (var o = 0; o < opponents.length; o++) {
var oppId = String(opponents[o]);
if (!h2hMap[oppId]) h2hMap[oppId] = { wins: 0, losses: 0, ties: 0 };
if (!nemesisMap[oppId]) nemesisMap[oppId] = { streak: 0, maxStreak: 0 };
var myScore = playerTotals[String(playerId)] || 0;
var oppScore = playerTotals[oppId] || 0;
if (myScore < oppScore) {
h2hMap[oppId].wins++;
nemesisMap[oppId].streak++;
if (nemesisMap[oppId].streak > nemesisMap[oppId].maxStreak) nemesisMap[oppId].maxStreak = nemesisMap[oppId].streak;
} else if (oppScore < myScore) {
h2hMap[oppId].losses++;
nemesisMap[oppId].streak = 0;
} else {
h2hMap[oppId].ties++;
nemesisMap[oppId].streak = 0;
}
}
}
if (overconfidentCount >= 3) overconfidentEarned = true;
if (highRollerCount >= 3) highRollerEarned = true;
if (ghostSessionsCount >= 5) ghostEarned = true;
var nemesisEarned = false;
for (var oppId in nemesisMap) {
if (nemesisMap[oppId].maxStreak >= 5) { nemesisEarned = true; break; }
}
var playerEloHistory = [];
var currentElo = DEFAULT_ELO;
var eloChange = 0;
for (var i = 0; i < eloHistory.length; i++) {
if (String(eloHistory[i].player_id) === String(playerId)) {
playerEloHistory.push(eloHistory[i]);
}
}
playerEloHistory.sort(function(a, b) { return Number(a.elo_id) - Number(b.elo_id); });
if (playerEloHistory.length > 0) {
var last = playerEloHistory[playerEloHistory.length - 1];
currentElo = Math.round(Number(last.new_rating));
eloChange = Math.round(Number(last.change));
}
var recentSessions = [];
for (var i = 0; i < playerSessions.length; i++) {
var s = playerSessions[i];
var sid = String(s.session_id);
var sessionHands = handsBySession[sid] || [];
var joinInfo = parseJoinInfo(s);
var allPlayerIds = getSessionPlayedPlayerIds(s, sessionHands);
var playerTotals = {};
for (var p = 0; p < allPlayerIds.length; p++) {
playerTotals[String(allPlayerIds[p])] = joinInfo[String(allPlayerIds[p])] || 0;
}
for (var h = 0; h < sessionHands.length; h++) {
var pid = String(sessionHands[h].player_id);
if (playerTotals[pid] !== undefined) playerTotals[pid] += Number(sessionHands[h].score);
}
var lowestScore = Infinity;
for (var pid in playerTotals) { if (playerTotals[pid] < lowestScore) lowestScore = playerTotals[pid]; }
var winners = [];
for (var pid in playerTotals) { if (playerTotals[pid] === lowestScore) winners.push(String(pid)); }
var handNums = new Set();
for (var h = 0; h < sessionHands.length; h++) handNums.add(sessionHands[h].hand_number);
var sessionEloEntry = null;
for (var e = 0; e < playerEloHistory.length; e++) {
if (String(playerEloHistory[e].session_id) === String(s.session_id)) {
sessionEloEntry = playerEloHistory[e];
break;
}
}
recentSessions.push({
session_id: s.session_id,
title: s.title,
date: s.date_started,
player_score: playerTotals[String(playerId)] || 0,
won: winners.indexOf(String(playerId)) !== -1 && winners.length === 1,
tied: winners.indexOf(String(playerId)) !== -1 && winners.length > 1,
hand_count: handNums.size,
player_count: allPlayerIds.length,
elo_after: sessionEloEntry ? Math.round(Number(sessionEloEntry.new_rating)) : null,
elo_change: sessionEloEntry ? Math.round(Number(sessionEloEntry.change)) : null
});
}
var h2hSummary = [];
for (var oppId in h2hMap) {
var entry = h2hMap[oppId];
h2hSummary.push({
opponent_id: oppId,
wins: entry.wins,
losses: entry.losses,
ties: entry.ties,
total: entry.wins + entry.losses + entry.ties
});
}
h2hSummary.sort(function(a, b) { return b.total - a.total; });
var avgHand = totalHandsPlayed > 0 ? totalScore / totalHandsPlayed : 0;
var lockoutAttemptScores = lockoutScores.concat(falseLockoutScoresArr);
var avgLockout = lockoutAttemptScores.length > 0 ? lockoutAttemptScores.reduce(function(a,b){return a+b;},0) / lockoutAttemptScores.length : null;
return {
player: {
player_id: player.player_id,
username: player.username,
date_joined: player.date_joined,
avatar_url: player.avatar_url || '',
bio: player.bio || '',
has_pin: Boolean(String(player.pin_verifier || player.pin_hash || '').trim())
},
stats: {
sessions_played: sessionsPlayed,
sessions_won: sessionsWon,
win_rate: sessionsPlayed > 0 ? ((sessionsWon / sessionsPlayed) * 100).toFixed(1) : '0',
hands_played: totalHandsPlayed,
total_score: totalScore,
avg_hand: avgHand.toFixed(2),
total_lockouts: totalLockouts,
total_false_lockouts: totalFalseLockouts,
lockout_rate: totalHandsPlayed > 0 ? ((totalLockouts / totalHandsPlayed) * 100).toFixed(1) : '0',
avg_lockout: avgLockout !== null ? avgLockout.toFixed(2) : null,
max_streak: maxStreakEver
},
elo: {
current: currentElo,
change: eloChange,
provisional: totalHandsPlayed < PROVISIONAL_HANDS,
history: playerEloHistory
},
achievements: {
apprentice: totalHandsPlayed >= 50,
centurion: totalHandsPlayed >= 100,
journeyman: totalHandsPlayed >= 200,
veteran: totalHandsPlayed >= 500,
millennium: totalHandsPlayed >= 1000,
legend: totalHandsPlayed >= 2000,
first_blood: sessionsWon >= 1,
ruler: sessionsWon >= 10,
dynasty: sessionsWon >= 25,
conqueror: sessionsWon >= 50,
picking_the_lock: totalLockouts >= 50,
the_locksmith: totalLockouts >= 100,
master_of_the_lock: totalLockouts >= 250,
grand_master: totalLockouts >= 500,
hat_trick: hatTrickEarned,
unstoppable: unstoppableEarned,
rock_bottom: rockBottomEarned,
the_hustler: hustlerEarned,
overconfident: overconfidentEarned,
the_strategist: strategistEarned,
high_roller: highRollerEarned,
bloodbath: bloodbathEarned,
slow_burner: slowBurnerEarned,
perfect_hand: perfectHandEarned,
the_ghost: ghostEarned,
lightning_round: lightningRoundEarned,
nemesis: nemesisEarned,
marksman: lockoutAttemptScores.length >= 25 && avgLockout !== null && avgLockout <= 1.0,
surgeon: lockoutAttemptScores.length >= 25 && avgLockout !== null && avgLockout <= 0.0,
ice_veins: lockoutAttemptScores.length >= 25 && avgLockout !== null && avgLockout <= -1.0,
consistent: totalHandsPlayed >= 100 && avgHand <= 6.0,
efficient: totalHandsPlayed >= 100 && avgHand <= 4.5,
machine: totalHandsPlayed >= 100 && avgHand <= 3.0,
elo_climber: currentElo >= 1100,
elo_elite: currentElo >= 1200,
elo_master: currentElo >= 1300
},
recent_sessions: recentSessions,
h2h_summary: h2hSummary.slice(0, 5)
};
}

// ===== AdminTools.gs =====
function onOpen() {
SpreadsheetApp.getUi()
.createMenu('Lockout Admin')
.addItem('Create backup', 'adminBackupWorkbook')
.addItem('Validate workbook', 'adminValidateWorkbook')
.addItem('Show system status', 'adminShowSystemStatus')
.addItem('Show recent activity', 'adminShowRecentActivity')
.addSeparator()
.addItem('Reset a player PIN', 'adminResetPlayerPinPrompt')
.addItem('Sign out all players', 'adminSignOutAllPlayersPrompt')
.addItem('Void a disputed session', 'adminVoidSessionPrompt')
.addSeparator()
.addItem('Configure photo uploads', 'adminConfigurePhotoUploadsPrompt')
.addSeparator()
.addSubMenu(
SpreadsheetApp.getUi().createMenu('Podcast')
.addItem('Generate last week’s podcast pack', 'adminGenerateLastWeekPodcastPack')
.addItem('Generate podcast pack for dates…', 'adminGeneratePodcastPackPrompt')
.addItem('Create Podcast Bible', 'adminCreatePodcastBible')
)
.addSeparator()
.addItem('Recalculate all Elo', 'adminRecalculateEloPrompt')
.addItem('Clear app caches', 'clearCaches')
.addToUi();
}
function backupWorkbook() {
var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
var sourceFile = DriveApp.getFileById(spreadsheet.getId());
var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
var copy = sourceFile.makeCopy(spreadsheet.getName() + ' BACKUP ' + stamp);
var url = 'https://docs.google.com/spreadsheets/d/' + copy.getId();
var properties = PropertiesService.getScriptProperties();
properties.setProperty('LAST_BACKUP_AT', new Date().toISOString());
properties.setProperty('LAST_BACKUP_URL', url);
return { success: true, id: copy.getId(), url: url };
}
function adminBackupWorkbook() {
var lock = LockService.getScriptLock();
lock.waitLock(30000);
var result;
try {
SpreadsheetApp.flush();
result = backupWorkbook();
if (SpreadsheetApp.getActiveSpreadsheet().getSheetByName('edit_history')) {
v2AppendAudit(
Utilities.getUuid(),
'Sheet admin',
'admin',
'CREATED_BACKUP',
'system',
'workbook',
result.url
);
}
} finally {
lock.releaseLock();
}
SpreadsheetApp.getUi().alert('Backup created:\n' + result.url);
}
function validateWorkbook() {
var required = ['players', 'sessions', 'hands', 'edit_history', 'elo_history', 'feedback'];
var issues = [];
var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
required.forEach(function(name) {
if (!spreadsheet.getSheetByName(name)) issues.push('Missing sheet: ' + name);
});
if (issues.length) return { success: false, issues: issues };
var requiredHeaders = {
players: ['player_id', 'username', 'date_joined', 'avatar_url', 'bio', 'pin_hash', 'pin_salt', 'pin_verifier', 'pin_version', 'profile_updated_at'],
sessions: ['session_id', 'title', 'host_player_id', 'players_involved', 'date_started', 'date_ended', 'notes', 'tags', 'player_join_info', 'false_lockout_penalty', 'photo_url', 'status', 'revision', 'auth_version', 'edit_code_verifier', 'updated_at'],
hands: ['hand_id', 'session_id', 'hand_number', 'player_id', 'score', 'lockout_player_id', 'false_lockout', 'comment', 'lockout_score'],
edit_history: ['timestamp', 'editor_name', 'action', 'record_type', 'record_id', 'request_id', 'actor_type', 'actor_player_id', 'details'],
elo_history: ['elo_id', 'session_id', 'player_id', 'old_rating', 'new_rating', 'change', 'date'],
feedback: ['feedback_id', 'timestamp', 'type', 'message', 'submitted_by']
};
Object.keys(requiredHeaders).forEach(function(name) {
v2FindMissingHeaders(name, requiredHeaders[name], issues);
});
v2FindHeaderOrder('hands', requiredHeaders.hands, issues);
v2FindHeaderOrder('elo_history', requiredHeaders.elo_history, issues);
if (issues.length) return { success: false, issues: issues };
v2FindDuplicateIds('players', 'player_id', issues);
v2FindDuplicateIds('sessions', 'session_id', issues);
v2FindDuplicateIds('hands', 'hand_id', issues);
v2FindDuplicateIds('elo_history', 'elo_id', issues);
var players = {};
sheetToObjects('players').forEach(function(player) {
var id = String(player.player_id || '').trim();
if (!/^\d+$/.test(id) || Number(id) < 1) issues.push('Player has an invalid player_id: ' + id);
if (!String(player.username || '').trim()) issues.push('Player ' + id + ' has no username.');
players[id] = true;
});
var sessions = {};
var sessionPlayers = {};
var sessionJoinInfo = {};
sheetToObjects('sessions').forEach(function(session) {
var sessionId = String(session.session_id || '').trim();
if (!/^\d+$/.test(sessionId) || Number(sessionId) < 1) issues.push('Session has an invalid session_id: ' + sessionId);
sessions[sessionId] = session;
var ids = [];
try {
ids = v2IdList(session.players_involved, 'Players');
ids.forEach(function(id) {
if (!players[id]) issues.push('Session ' + session.session_id + ' references missing player ' + id);
});
} catch (err) {
issues.push('Session ' + session.session_id + ' has invalid players_involved.');
}
sessionPlayers[sessionId] = {};
ids.forEach(function(id) { sessionPlayers[sessionId][String(id)] = true; });
var hostId = String(session.host_player_id || '').trim();
if (!players[hostId]) issues.push('Session ' + sessionId + ' references missing host player ' + hostId);
if (hostId && !sessionPlayers[sessionId][hostId]) issues.push('Session ' + sessionId + ' host is not in players_involved.');
var status = String(session.status || '').trim().toLowerCase();
if (['active', 'completed', 'void'].indexOf(status) < 0) issues.push('Session ' + sessionId + ' has invalid status "' + status + '".');
var hasEndDate = String(session.date_ended || '').trim() !== '';
if (status === 'active' && hasEndDate) issues.push('Session ' + sessionId + ' is active but has date_ended.');
if (status === 'completed' && !hasEndDate) issues.push('Session ' + sessionId + ' is completed but has no date_ended.');
if (Number(session.revision || 0) < 1) issues.push('Session ' + session.session_id + ' has no valid revision.');
if (Number(session.auth_version || 0) < 1) issues.push('Session ' + session.session_id + ' has no valid auth_version.');
try {
var joinInfo = v2JoinInfoForValidation(session);
sessionJoinInfo[sessionId] = joinInfo;
Object.keys(joinInfo).forEach(function(id) {
if (!players[String(id)]) issues.push('Session ' + sessionId + ' join info references missing player ' + id);
if (!sessionPlayers[sessionId][String(id)]) issues.push('Session ' + sessionId + ' join player ' + id + ' is not in players_involved.');
});
} catch (err) {
sessionJoinInfo[sessionId] = {};
issues.push('Session ' + sessionId + ' has invalid player_join_info.');
}
});
var handRows = {};
var handLockouts = {};
var handGroups = {};
var handNumbersBySession = {};
sheetToObjects('hands').forEach(function(hand) {
var handId = String(hand.hand_id || '').trim();
var sessionId = String(hand.session_id || '').trim();
var playerId = String(hand.player_id || '').trim();
var handNumber = Number(hand.hand_number);
if (!sessions[sessionId]) issues.push('Hand ' + handId + ' references missing session ' + sessionId);
if (!players[playerId]) issues.push('Hand ' + handId + ' references missing player ' + playerId);
if (sessions[sessionId] && !sessionPlayers[sessionId][playerId]) issues.push('Hand ' + handId + ' player ' + playerId + ' is not in session ' + sessionId + '.');
if (!Number.isInteger(handNumber) || handNumber < 1) issues.push('Hand ' + handId + ' has invalid hand_number.');
if (!isFinite(Number(hand.score))) issues.push('Hand ' + handId + ' has a non-numeric score.');
var rowKey = sessionId + '|' + handNumber + '|' + playerId;
if (handRows[rowKey]) issues.push('Duplicate player row for session ' + sessionId + ', hand ' + handNumber + ', player ' + playerId + '.');
handRows[rowKey] = true;
var groupKey = sessionId + '|' + handNumber;
if (!handGroups[groupKey]) handGroups[groupKey] = [];
handGroups[groupKey].push(hand);
if (!handNumbersBySession[sessionId]) handNumbersBySession[sessionId] = {};
handNumbersBySession[sessionId][String(handNumber)] = true;
if (!handLockouts[groupKey]) handLockouts[groupKey] = [];
var lockoutId = String(hand.lockout_player_id || '').trim();
if (lockoutId) {
handLockouts[groupKey].push(lockoutId);
if (!players[lockoutId]) issues.push('Hand ' + handId + ' references missing lockout player ' + lockoutId);
if (lockoutId !== playerId) issues.push('Hand ' + handId + ' stores its lockout marker on the wrong player row.');
if (!isFinite(Number(hand.lockout_score))) issues.push('Hand ' + handId + ' has a non-numeric lockout_score.');
} else if (hand.false_lockout == 1 || hand.false_lockout === true) {
issues.push('Hand ' + handId + ' is marked false lockout without a lockout player.');
}
});
Object.keys(handLockouts).forEach(function(key) {
if (handLockouts[key].length !== 1) issues.push('Session/hand ' + key + ' has ' + handLockouts[key].length + ' lockout markers; expected 1.');
});
Object.keys(handGroups).forEach(function(groupKey) {
var parts = groupKey.split('|');
var sessionId = parts[0];
var handNumber = Number(parts[1]);
var session = sessions[sessionId];
if (!session) return;
var joinInfo = sessionJoinInfo[sessionId] || {};
var expectedPlayers = Object.keys(sessionPlayers[sessionId] || {}).filter(function(playerId) {
return !joinInfo[playerId] || Number(joinInfo[playerId].hand || 1) <= handNumber;
}).sort();
var actualPlayers = handGroups[groupKey].map(function(hand) {
return String(hand.player_id);
}).filter(function(playerId, index, values) {
return values.indexOf(playerId) === index;
}).sort();
expectedPlayers.forEach(function(playerId) {
if (actualPlayers.indexOf(playerId) < 0) {
issues.push('Session ' + sessionId + ', hand ' + handNumber + ' is missing player ' + playerId + '.');
}
});
actualPlayers.forEach(function(playerId) {
if (expectedPlayers.indexOf(playerId) < 0) {
issues.push('Session ' + sessionId + ', hand ' + handNumber + ' contains inactive player ' + playerId + '.');
}
});
var lockoutRows = handGroups[groupKey].filter(function(hand) {
return String(hand.lockout_player_id || '') &&
String(hand.lockout_player_id) === String(hand.player_id);
});
if (lockoutRows.length !== 1) return;
var lockoutRow = lockoutRows[0];
var rawLockoutScore = Number(lockoutRow.lockout_score);
if (!isFinite(rawLockoutScore)) return;
var declarationScores = handGroups[groupKey].map(function(hand) {
return String(hand.player_id) === String(lockoutRow.player_id)
? rawLockoutScore
: Number(hand.score);
});
if (!declarationScores.every(function(score) { return isFinite(score); })) return;
var lowest = Math.min.apply(null, declarationScores);
var lowestCount = declarationScores.filter(function(score) { return score === lowest; }).length;
var shouldBeFalse = rawLockoutScore > 5 || rawLockoutScore !== lowest || lowestCount !== 1;
var storedFalse = lockoutRow.false_lockout == 1 ||
lockoutRow.false_lockout === true ||
String(lockoutRow.false_lockout).toLowerCase() === 'true';
if (storedFalse !== shouldBeFalse) {
issues.push('Session ' + sessionId + ', hand ' + handNumber + ' has an incorrect false-lockout flag.');
}
var storedPenalty = session.false_lockout_penalty;
var penalty = storedPenalty === '' || storedPenalty === null || storedPenalty === undefined
? DEFAULT_FALSE_LOCKOUT_PENALTY
: Number(storedPenalty);
var expectedStoredScore = shouldBeFalse
? rawLockoutScore + penalty
: (rawLockoutScore < 0 ? rawLockoutScore : 0);
if (Number(lockoutRow.score) !== expectedStoredScore) {
issues.push(
'Session ' + sessionId + ', hand ' + handNumber +
' has stored lockout score ' + lockoutRow.score + '; expected ' + expectedStoredScore + '.'
);
}
});
Object.keys(handNumbersBySession).forEach(function(sessionId) {
var numbers = Object.keys(handNumbersBySession[sessionId]).map(Number).sort(function(a, b) { return a - b; });
for (var expected = 1; expected <= numbers.length; expected++) {
if (numbers[expected - 1] !== expected) {
issues.push('Session ' + sessionId + ' has non-contiguous hand numbers.');
break;
}
}
});
Object.keys(sessionJoinInfo).forEach(function(sessionId) {
var actualJoinInfo = sessionJoinInfo[sessionId] || {};
if (!Object.keys(actualJoinInfo).length || typeof v2RecalculateLateJoinStartingScores !== 'function') return;
try {
var expectedJoinInfo = JSON.parse(v2RecalculateLateJoinStartingScores(sessions[sessionId], sessionId));
Object.keys(expectedJoinInfo).forEach(function(playerId) {
if (Number(actualJoinInfo[playerId].starting_score) !== Number(expectedJoinInfo[playerId].starting_score)) {
issues.push(
'Session ' + sessionId + ' player ' + playerId + ' has starting score ' +
actualJoinInfo[playerId].starting_score + '; expected ' + expectedJoinInfo[playerId].starting_score + '.'
);
}
});
} catch (err) {
issues.push('Session ' + sessionId + ' late-join balances could not be verified.');
}
});
var eloRows = sheetToObjects('elo_history');
var eloSessionPlayers = {};
var eloByPlayer = {};
eloRows.forEach(function(entry) {
if (!sessions[String(entry.session_id)]) issues.push('Elo entry ' + entry.elo_id + ' references missing session ' + entry.session_id);
if (!players[String(entry.player_id)]) issues.push('Elo entry ' + entry.elo_id + ' references missing player ' + entry.player_id);
if (![entry.old_rating, entry.new_rating, entry.change].every(function(value) { return isFinite(Number(value)); })) {
issues.push('Elo entry ' + entry.elo_id + ' contains a non-numeric rating.');
}
var sessionId = String(entry.session_id);
var playerId = String(entry.player_id);
var eloKey = sessionId + '|' + playerId;
if (eloSessionPlayers[eloKey]) issues.push('Duplicate Elo row for session ' + sessionId + ', player ' + playerId + '.');
eloSessionPlayers[eloKey] = true;
if (!eloByPlayer[playerId]) eloByPlayer[playerId] = [];
eloByPlayer[playerId].push(entry);
if (sessions[sessionId] && !isOfficialCompletedSession(sessions[sessionId])) {
issues.push('Elo entry ' + entry.elo_id + ' belongs to a Testing, void or incomplete session.');
}
if (isFinite(Number(entry.old_rating)) && isFinite(Number(entry.new_rating)) &&
isFinite(Number(entry.change)) &&
Number(entry.new_rating) - Number(entry.old_rating) !== Number(entry.change)) {
issues.push('Elo entry ' + entry.elo_id + ' has new_rating - old_rating different from change.');
}
});
Object.keys(eloByPlayer).forEach(function(playerId) {
var history = eloByPlayer[playerId].sort(function(a, b) {
return Number(a.elo_id) - Number(b.elo_id);
});
for (var i = 0; i < history.length; i++) {
var expectedOld = i === 0 ? DEFAULT_ELO : Number(history[i - 1].new_rating);
if (Number(history[i].old_rating) !== expectedOld) {
issues.push('Elo chain for player ' + playerId + ' breaks at Elo entry ' + history[i].elo_id + '.');
}
}
});
Object.keys(sessions).forEach(function(sessionId) {
if (!isOfficialCompletedSession(sessions[sessionId])) return;
var played = {};
Object.keys(handGroups).forEach(function(groupKey) {
if (groupKey.split('|')[0] !== sessionId) return;
handGroups[groupKey].forEach(function(hand) { played[String(hand.player_id)] = true; });
});
var participantIds = Object.keys(played);
if (participantIds.length < 2) {
issues.push('Official completed session ' + sessionId + ' has fewer than two played participants.');
return;
}
participantIds.forEach(function(playerId) {
if (!eloSessionPlayers[sessionId + '|' + playerId]) {
issues.push('Missing Elo row for session ' + sessionId + ', player ' + playerId + '.');
}
});
Object.keys(eloSessionPlayers).forEach(function(key) {
if (key.split('|')[0] === sessionId && !played[key.split('|')[1]]) {
issues.push('Unexpected Elo row for session ' + sessionId + ', player ' + key.split('|')[1] + '.');
}
});
});
var sessionRows = sheetToObjects('sessions');
var handRowsForCounts = sheetToObjects('hands');
var uniqueHands = {};
var officialSessionIds = {};
var testingSessionCount = 0;
var voidSessionCount = 0;
var activeSessionCount = 0;
sessionRows.forEach(function(session) {
var id = String(session.session_id);
if (isOfficialCompletedSession(session)) officialSessionIds[id] = true;
if (hasSessionTag(session, 'testing')) testingSessionCount++;
if (String(session.status || '').toLowerCase() === 'void') voidSessionCount++;
if (!String(session.date_ended || '').trim() && String(session.status || '').toLowerCase() !== 'void') {
activeSessionCount++;
}
});
var officialUniqueHands = {};
var officialHandPlayerRows = 0;
handRowsForCounts.forEach(function(hand) {
var handKey = String(hand.session_id) + '|' + String(hand.hand_number);
uniqueHands[handKey] = true;
if (officialSessionIds[String(hand.session_id)]) {
officialUniqueHands[handKey] = true;
officialHandPlayerRows++;
}
});
var counts = {
players: Object.keys(players).length,
sessions: sessionRows.length,
completed_official_sessions: Object.keys(officialSessionIds).length,
testing_sessions: testingSessionCount,
void_sessions: voidSessionCount,
active_sessions: activeSessionCount,
unique_hands: Object.keys(uniqueHands).length,
official_unique_hands: Object.keys(officialUniqueHands).length,
hand_player_rows: handRowsForCounts.length,
official_hand_player_rows: officialHandPlayerRows,
elo_rows: eloRows.length
};
return { success: issues.length === 0, issues: issues, counts: counts };
}
function v2JoinInfoForValidation(session) {
var raw = session.player_join_info ? JSON.parse(String(session.player_join_info)) : {};
if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid join info');
var result = {};
Object.keys(raw).forEach(function(playerId) {
if (!/^\d+$/.test(String(playerId))) throw new Error('Invalid join player');
var item = raw[playerId];
if (typeof item === 'number') {
if (!Number.isInteger(item) || item < 1) throw new Error('Invalid join hand');
result[String(playerId)] = { hand: item, starting_score: 0 };
return;
}
if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid join entry');
var hand = Number(item.hand);
var startingScore = Number(item.starting_score);
if (!Number.isInteger(hand) || hand < 1 || !Number.isInteger(startingScore)) {
throw new Error('Invalid join entry');
}
result[String(playerId)] = { hand: hand, starting_score: startingScore };
});
return result;
}
function v2FindMissingHeaders(sheetName, requiredHeaders, issues) {
var headers = v2Headers(getSheet(sheetName));
requiredHeaders.forEach(function(header) {
if (headers.indexOf(header) < 0) issues.push('Missing header in ' + sheetName + ': ' + header);
});
}
function v2FindHeaderOrder(sheetName, expectedHeaders, issues) {
var actual = v2Headers(getSheet(sheetName));
for (var i = 0; i < expectedHeaders.length; i++) {
if (actual[i] !== expectedHeaders[i]) {
issues.push(
sheetName + ' columns are out of order. Expected column ' + (i + 1) +
' to be ' + expectedHeaders[i] + '.'
);
return;
}
}
}
function v2FindDuplicateIds(sheetName, idHeader, issues) {
var seen = {};
sheetToObjects(sheetName).forEach(function(record) {
var id = String(record[idHeader] || '').trim();
if (!id) {
issues.push('Blank ' + idHeader + ' in ' + sheetName);
return;
}
if (seen[id]) issues.push('Duplicate ' + idHeader + ' ' + id + ' in ' + sheetName);
seen[id] = true;
});
}
function adminValidateWorkbook() {
var result = validateWorkbook();
v2RecordValidationStatus(result);
var counts = result.counts || {};
var summary = '\n\nPlayers: ' + Number(counts.players || 0) +
'\nSessions (all, including Testing/void): ' + Number(counts.sessions || 0) +
'\nOfficial completed sessions: ' + Number(counts.completed_official_sessions || 0) +
'\nTesting sessions: ' + Number(counts.testing_sessions || 0) +
'\nVoid sessions: ' + Number(counts.void_sessions || 0) +
'\nActive sessions: ' + Number(counts.active_sessions || 0) +
'\nUnique hands (all stored data): ' + Number(counts.unique_hands || 0) +
'\nUnique hands (official completed): ' + Number(counts.official_unique_hands || 0) +
'\nHand-player rows (all stored data): ' + Number(counts.hand_player_rows || 0) +
'\nHand-player rows (official completed): ' + Number(counts.official_hand_player_rows || 0) +
'\nElo rows (official only): ' + Number(counts.elo_rows || 0);
SpreadsheetApp.getUi().alert(
result.success
? 'Validation passed: no structural problems found.' + summary
: 'Validation issues:\n\n' + result.issues.join('\n') + summary
);
}
function v2RecordValidationStatus(result) {
var properties = PropertiesService.getScriptProperties();
properties.setProperty('LAST_VALIDATION_AT', new Date().toISOString());
properties.setProperty('LAST_VALIDATION_RESULT', result && result.success ? 'passed' : 'failed');
properties.setProperty('LAST_VALIDATION_COUNTS', JSON.stringify(result && result.counts || {}));
}
function adminShowSystemStatus() {
var result = validateWorkbook();
v2RecordValidationStatus(result);
var properties = PropertiesService.getScriptProperties();
var counts = result.counts || {};
var backupAt = properties.getProperty('LAST_BACKUP_AT') || 'Not recorded';
var backupUrl = properties.getProperty('LAST_BACKUP_URL') || 'Not recorded';
var message =
'Version: ' + V2_VERSION +
'\nSchema: ' + (properties.getProperty('SCHEMA_VERSION') || 'unconfigured') +
'\nWorkbook validation: ' + (result.success ? 'PASSED' : 'FAILED') +
'\nPlayers: ' + Number(counts.players || 0) +
'\nSessions: ' + Number(counts.sessions || 0) +
'\nActive sessions: ' + Number(counts.active_sessions || 0) +
'\nUnique hands: ' + Number(counts.unique_hands || 0) +
'\nHand-player rows: ' + Number(counts.hand_player_rows || 0) +
'\nElo rows: ' + Number(counts.elo_rows || 0) +
'\n\nLast backup: ' + backupAt +
'\nBackup: ' + backupUrl;
if (!result.success) {
message += '\n\nFirst validation issues:\n' + result.issues.slice(0, 8).join('\n');
}
SpreadsheetApp.getUi().alert('Lockout system status', message, SpreadsheetApp.getUi().ButtonSet.OK);
}
function adminShowRecentActivity() {
var sheet = getSheet('edit_history');
var values = sheet.getDataRange().getValues();
if (values.length <= 1) {
SpreadsheetApp.getUi().alert('No recorded activity yet.');
return;
}
var headers = values[0].map(function(value) { return String(value); });
var timestampIndex = headers.indexOf('timestamp');
var editorIndex = headers.indexOf('editor_name');
var actionIndex = headers.indexOf('action');
var recordTypeIndex = headers.indexOf('record_type');
var recordIdIndex = headers.indexOf('record_id');
var start = Math.max(1, values.length - 12);
var lines = [];
for (var row = values.length - 1; row >= start; row--) {
var timestamp = values[row][timestampIndex];
if (Object.prototype.toString.call(timestamp) === '[object Date]' && !isNaN(timestamp.getTime())) {
timestamp = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}
lines.push(
String(timestamp || '') + ' — ' +
String(values[row][editorIndex] || 'Unknown') + ' — ' +
String(values[row][actionIndex] || '') + ' — ' +
String(values[row][recordTypeIndex] || '') + ' ' +
String(values[row][recordIdIndex] || '')
);
}
SpreadsheetApp.getUi().alert(
'Recent Lockout activity',
lines.join('\n\n'),
SpreadsheetApp.getUi().ButtonSet.OK
);
}
function adminResetPlayerPinPrompt() {
var ui = SpreadsheetApp.getUi();
var response = ui.prompt('Reset player PIN', 'Enter the player ID. The player can then choose a new four-digit PIN.', ui.ButtonSet.OK_CANCEL);
if (response.getSelectedButton() !== ui.Button.OK) return;
var playerId;
try { playerId = v2Id(response.getResponseText(), 'Player'); } catch (err) { ui.alert(err.message); return; }
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
var found = v2FindRow('players', 'player_id', playerId);
if (!found) { ui.alert('Player not found.'); return; }
var properties = PropertiesService.getScriptProperties();
var versionKey = 'PROFILE_AUTH_VERSION_' + playerId;
properties.setProperty(versionKey, String(Number(properties.getProperty(versionKey) || 1) + 1));
v2SetRowValues(found.sheet, found.rowNumber, found.headers, {
pin_hash: '',
pin_salt: '',
pin_verifier: '',
pin_version: '',
profile_updated_at: v2Timestamp()
});
v2AppendAudit(
Utilities.getUuid(),
'Sheet admin',
'admin',
'RESET_PLAYER_PIN',
'player',
playerId,
'Existing profile tokens revoked.'
);
v2InvalidateReadCache();
} finally {
lock.releaseLock();
}
ui.alert('PIN reset for player ' + playerId + '. Their saved sign-ins have also been revoked.');
}
function adminConfigurePhotoUploadsPrompt() {
var ui = SpreadsheetApp.getUi();
var properties = PropertiesService.getScriptProperties();
var enabled = Boolean(properties.getProperty('IMGBB_API_KEY'));
var response = ui.prompt(
'Configure photo uploads',
(enabled ? 'Photo uploads are currently enabled. ' : '') +
'Paste the dedicated ImgBB API key to enable uploads, or enter DISABLE to turn uploads off.',
ui.ButtonSet.OK_CANCEL
);
if (response.getSelectedButton() !== ui.Button.OK) return;
var value = String(response.getResponseText() || '').trim();
if (value.toUpperCase() === 'DISABLE') {
properties.deleteProperty('IMGBB_API_KEY');
v2AppendAudit(
Utilities.getUuid(),
'Sheet admin',
'admin',
'DISABLED_PHOTOS',
'system',
'photo_uploads',
''
);
v2InvalidateReadCache();
ui.alert('Photo uploads disabled. Existing photo links are unchanged.');
return;
}
if (!/^[A-Za-z0-9_-]{16,128}$/.test(value)) {
ui.alert('That does not look like a valid ImgBB API key. Nothing was changed.');
return;
}
properties.setProperty('IMGBB_API_KEY', value);
v2AppendAudit(
Utilities.getUuid(),
'Sheet admin',
'admin',
'ENABLED_PHOTOS',
'system',
'photo_uploads',
''
);
v2InvalidateReadCache();
ui.alert('Photo uploads enabled. Refresh the app before testing an upload.');
}
function adminSignOutAllPlayersPrompt() {
var ui = SpreadsheetApp.getUi();
var confirm = ui.alert(
'Sign out all players?',
'Every device will need to select a player and enter their four-digit PIN again.',
ui.ButtonSet.YES_NO
);
if (confirm !== ui.Button.YES) return;
var result = adminSignOutAllPlayers();
ui.alert('All saved player sign-ins have been revoked. Access version: ' + result.player_auth_version + '.');
}
function adminSignOutAllPlayers() {
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
var properties = PropertiesService.getScriptProperties();
var nextVersion = Number(properties.getProperty('PLAYER_AUTH_VERSION') || 1) + 1;
properties.setProperty('PLAYER_AUTH_VERSION', String(nextVersion));
v2AppendAudit(
Utilities.getUuid(),
'Sheet admin',
'admin',
'SIGNED_OUT_ALL_PLAYERS',
'system',
'player_access',
'All saved player tokens revoked. Version ' + nextVersion + '.'
);
return { success: true, player_auth_version: nextVersion };
} finally {
lock.releaseLock();
}
}
function adminVoidSessionPrompt() {
var ui = SpreadsheetApp.getUi();
var response = ui.prompt('Void disputed session', 'Enter the session ID. It will stop appearing in statistics but remain in the workbook.', ui.ButtonSet.OK_CANCEL);
if (response.getSelectedButton() !== ui.Button.OK) return;
var sessionId;
try { sessionId = v2Id(response.getResponseText(), 'Session'); } catch (err) { ui.alert(err.message); return; }
var found = v2FindRow('sessions', 'session_id', sessionId);
if (!found) { ui.alert('Session not found.'); return; }
var confirm = ui.alert('Void session ' + sessionId + '?', 'Create a backup first. Elo must be recalculated afterwards.', ui.ButtonSet.YES_NO);
if (confirm !== ui.Button.YES) return;
adminVoidSession(sessionId);
ui.alert('Session voided. Now run “Recalculate all Elo”.');
}
function adminVoidSession(sessionId) {
sessionId = v2Id(sessionId, 'Session');
var lock = LockService.getScriptLock();
lock.waitLock(10000);
try {
var found = v2FindRow('sessions', 'session_id', sessionId);
if (!found) throw new Error('Session not found.');
if (String(found.object.status || '').toLowerCase() === 'void') {
throw new Error('This session is already void.');
}
v2SetRowValues(found.sheet, found.rowNumber, found.headers, {
status: 'void',
revision: Number(found.object.revision || 1) + 1,
auth_version: Number(found.object.auth_version || 1) + 1,
updated_at: v2Timestamp()
});
v2AppendAudit(
Utilities.getUuid(),
'Sheet admin',
'admin',
'VOIDED_SESSION',
'session',
sessionId,
'Session retained but excluded from public results.'
);
v2InvalidateReadCache();
return { success: true };
} finally {
lock.releaseLock();
}
}
function adminRecalculateEloPrompt() {
var ui = SpreadsheetApp.getUi();
var confirm = ui.alert('Recalculate all Elo?', 'Create a backup first. This rebuilds the Elo history from completed, non-testing, non-void sessions.', ui.ButtonSet.YES_NO);
if (confirm !== ui.Button.YES) return;
var result = recalculateAllElo();
v2AppendAudit(
Utilities.getUuid(),
'Sheet admin',
'admin',
'RECALCULATED_ELO',
'system',
'elo',
'Sessions processed: ' + result.sessions_processed
);
ui.alert('Elo recalculated for ' + result.sessions_processed + ' sessions.');
}
function clearCaches() {
v2InvalidateReadCache();
try { SpreadsheetApp.getUi().alert('App caches cleared.'); } catch (err) {}
return { success: true };
}
