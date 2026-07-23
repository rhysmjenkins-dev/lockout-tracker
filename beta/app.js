// ============================================
// CONFIGURATION & STATE
// ============================================
const API_URL = window.LOCKOUT_CONFIG && window.LOCKOUT_CONFIG.apiUrl
    ? window.LOCKOUT_CONFIG.apiUrl
    : 'PASTE_BETA_APPS_SCRIPT_EXEC_URL_HERE';

// ============================================
// CONSTANTS
// ============================================
const CHART_COLORS = ['#667eea', '#f5576c', '#4facfe', '#00f2fe', '#fa709a'];
const DEFAULT_ELO = 1000;
const PROVISIONAL_HANDS = 50;
const PROVISIONAL_K = 40;
const STANDARD_K = 24;
const DEFAULT_FALSE_LOCKOUT_PENALTY = 10;
const MIN_SCORE = -2;

let currentSession = null;
let currentHandNumber = 1;
let allPlayers = [];
let sessionPlayers = [];
let allSessions = [];
let currentEditingHand = null;
let selectedPlayerToAdd = null;
let playersLoaded = false;
let playerCache = {};
let eloCache = [];
let navigationIntentId = 0;
let screenTransitionTimer = null;

function beginNavigationIntent() {
    navigationIntentId++;
    if (screenTransitionTimer) {
        clearTimeout(screenTransitionTimer);
        screenTransitionTimer = null;
    }
    return navigationIntentId;
}

function getNavigationIntent() {
    return navigationIntentId;
}

function isCurrentNavigationIntent(intentId) {
    return intentId === navigationIntentId;
}

const READ_ACTIONS = new Set([
    'getPlayers', 'getSessions', 'getRecentSessions', 'getSession', 'getHands',
    'getEditHistory', 'getSessionsWithHands', 'getHeadToHeadMatrix',
    'getPlayerComparisonDetailed', 'getEloRatings', 'getEloHistory',
    'getEloHistoryAll', 'getPlayerProfile', 'checkPlayerPin', 'getPublicConfig'
]);
const SESSION_ACTIONS = new Set([
    'updateSession', 'updateSessionPhoto', 'addPlayerToSession', 'closeSession',
    'addHand', 'updateHand', 'deleteHand'
]);
const MEMBER_ACTIONS = new Set([
    'addPlayer', 'createSession', 'submitFeedback', 'setPlayerPin'
]);

function getDeviceId() {
    let id = localStorage.getItem('lockout_device_id');
    if (!id) {
        id = (window.crypto && crypto.randomUUID)
            ? crypto.randomUUID()
            : 'device-' + Date.now() + '-' + Math.random().toString(36).slice(2);
        localStorage.setItem('lockout_device_id', id);
    }
    return id;
}

function getMemberToken() {
    return localStorage.getItem('lockout_member_token') || '';
}

function setMemberToken(token) {
    if (token) localStorage.setItem('lockout_member_token', token);
    else localStorage.removeItem('lockout_member_token');
    updateEditingStatus();
}

function getSessionToken(sessionId) {
    return localStorage.getItem('lockout_session_token_' + sessionId) || '';
}

function setSessionToken(sessionId, token) {
    if (token) localStorage.setItem('lockout_session_token_' + sessionId, token);
}

function getProfileToken(playerId) {
    return sessionStorage.getItem('lockout_profile_token_' + playerId) || '';
}

function setProfileToken(playerId, token) {
    if (token) sessionStorage.setItem('lockout_profile_token_' + playerId, token);
}

function editingDisplayName() {
    const identity = getStoredIdentity();
    return identity && identity.username ? identity.username : (localStorage.getItem('lockout_editor_name') || 'Friend');
}

async function unlockEditing(forcePrompt) {
    if (getMemberToken() && !forcePrompt) return getMemberToken();
    const suggested = editingDisplayName() === 'Friend' ? '' : editingDisplayName();
    const input = await requestAccessInput({
        title: 'Unlock editing',
        message: 'Enter the friends editing code. You only need to do this once on this device.',
        primaryLabel: 'Friends editing code',
        primaryType: 'password',
        primaryAutocomplete: 'current-password',
        secondaryLabel: 'Your name for the edit history',
        secondaryValue: suggested,
        confirmText: 'Unlock editing'
    });
    if (!input) return '';
    const passphrase = input.primary;
    const displayName = input.secondary || 'Friend';
    const data = await rawApiRequest('unlockMember', {
        passphrase: passphrase,
        device_id: getDeviceId(),
        display_name: displayName
    }, false);
    if (data.error) {
        alert(data.error);
        return '';
    }
    localStorage.setItem('lockout_editor_name', displayName);
    setMemberToken(data.member_token);
    return data.member_token;
}

function lockEditing() {
    setMemberToken('');
}

function updateEditingStatus() {
    const status = document.getElementById('editingStatus');
    if (!status) return;
    if (getMemberToken()) {
        status.innerHTML = '<span class="editing-unlocked">Editing unlocked</span> <button type="button" class="link-button" onclick="lockEditing()">Lock</button>';
    } else {
        status.innerHTML = '<button type="button" class="link-button" onclick="unlockEditing(true)">Unlock editing</button>';
    }
}

async function ensureSessionToken(sessionId) {
    let token = getSessionToken(sessionId);
    if (token) return token;
    const memberToken = await unlockEditing(false);
    if (!memberToken) return '';
    const input = await requestAccessInput({
        title: 'Unlock this session',
        message: 'Enter the six-digit editing code shown when the session began.',
        primaryLabel: 'Session editing code',
        primaryType: 'text',
        primaryInputMode: 'numeric',
        primaryMaxLength: 6,
        confirmText: 'Unlock session'
    });
    if (!input) return '';
    const code = input.primary;
    const data = await rawApiRequest('claimSession', {
        member_token: memberToken,
        session_id: sessionId,
        edit_code: code
    }, false);
    if (data.error) {
        alert(data.error);
        return '';
    }
    token = data.session_token;
    setSessionToken(sessionId, token);
    if (currentSession && String(currentSession.session_id) === String(sessionId) && data.revision) {
        currentSession.revision = Number(data.revision);
    }
    return token;
}

let _accessModalResolver = null;

function requestAccessInput(options) {
    return new Promise(function(resolve) {
        _accessModalResolver = resolve;
        document.getElementById('accessModalHeading').textContent = options.title || 'Editing access';
        document.getElementById('accessModalMessage').textContent = options.message || '';
        const primary = document.getElementById('accessPrimaryInput');
        const primaryLabel = document.getElementById('accessPrimaryLabel');
        primaryLabel.textContent = options.primaryLabel || 'Code';
        primary.type = options.primaryType || 'text';
        primary.value = options.primaryValue || '';
        primary.readOnly = Boolean(options.primaryReadOnly);
        primary.maxLength = options.primaryMaxLength || 200;
        primary.inputMode = options.primaryInputMode || 'text';
        primary.autocomplete = options.primaryAutocomplete || 'off';

        const secondaryGroup = document.getElementById('accessSecondaryGroup');
        const secondary = document.getElementById('accessSecondaryInput');
        if (options.secondaryLabel) {
            secondaryGroup.style.display = 'block';
            document.getElementById('accessSecondaryLabel').textContent = options.secondaryLabel;
            secondary.value = options.secondaryValue || '';
        } else {
            secondaryGroup.style.display = 'none';
            secondary.value = '';
        }
        document.getElementById('accessModalConfirm').textContent = options.confirmText || 'Continue';
        document.getElementById('accessModalCancel').style.display = options.hideCancel ? 'none' : '';
        document.getElementById('accessModal').classList.add('active');
        setTimeout(function() { primary.focus(); primary.select(); }, 0);
    });
}

function finishAccessModal(confirmed) {
    const modal = document.getElementById('accessModal');
    const primary = document.getElementById('accessPrimaryInput');
    const secondary = document.getElementById('accessSecondaryInput');
    const result = confirmed ? { primary: primary.value.trim(), secondary: secondary.value.trim() } : null;
    modal.classList.remove('active');
    if (_accessModalResolver) _accessModalResolver(result);
    _accessModalResolver = null;
}

async function showSessionEditCode(code) {
    await requestAccessInput({
        title: 'Session editing code',
        message: 'Keep this code with the group. Another trusted device needs it only if it takes over scoring.',
        primaryLabel: 'Six-digit code',
        primaryValue: String(code),
        primaryReadOnly: true,
        confirmText: 'Done',
        hideCancel: true
    });
}

// ============================================
// BUTTON LOADING STATE HELPER
// ============================================
function setButtonLoading(buttonElement, isLoading, originalText) {
    if (isLoading) {
        buttonElement.disabled = true;
        buttonElement.dataset.originalText = buttonElement.textContent;
        buttonElement.textContent = '⏳ Loading...';
        buttonElement.style.opacity = '0.6';
        buttonElement.style.cursor = 'not-allowed';
    } else {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText || buttonElement.dataset.originalText || 'Submit';
        buttonElement.style.opacity = '1';
        buttonElement.style.cursor = 'pointer';
    }
}

// ============================================
// API & UTILITY FUNCTIONS
// ============================================
async function rawApiRequest(action, params, isRead) {
    if (!API_URL || API_URL.includes('PASTE_BETA_')) {
        return { error: 'The beta backend has not been connected yet.', code: 'BETA_NOT_CONFIGURED' };
    }
    try {
        let response;
        if (isRead) {
            const url = new URL(API_URL);
            url.searchParams.append('action', action);
            for (const key in params) {
                if (params[key] !== undefined && params[key] !== null) url.searchParams.append(key, params[key]);
            }
            response = await fetch(url, { method: 'GET', cache: 'no-store' });
        } else {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({ action: action }, params || {}))
            });
        }
        if (!response.ok) {
            return { error: 'Network error: ' + response.status + ' ' + response.statusText };
        }
        const data = await response.json();
        if (data && data.error) {
            console.warn('API [' + action + '] returned error:', data.error);
        }
        return data;
    } catch (error) {
        console.error('API [' + action + '] failed:', error.message);
        return { error: error.message };
    }
}

async function apiCall(action, params) {
    params = Object.assign({}, params || {});
    const isRead = READ_ACTIONS.has(action);
    if (!isRead) {
        if (MEMBER_ACTIONS.has(action)) {
            params.member_token = getMemberToken() || await unlockEditing(false);
            if (!params.member_token) return { error: 'Editing was not unlocked.', code: 'AUTH_REQUIRED' };
        }
        if (SESSION_ACTIONS.has(action)) {
            const sessionId = params.session_id || (currentSession && currentSession.session_id);
            params.session_token = await ensureSessionToken(sessionId);
            if (!params.session_token) return { error: 'Session editing was not unlocked.', code: 'SESSION_AUTH_REQUIRED' };
            params.revision = currentSession && String(currentSession.session_id) === String(sessionId)
                ? Number(currentSession.revision || 1)
                : Number(params.revision || 1);
        }
        if (action === 'updatePlayerProfile') {
            params.profile_token = getProfileToken(params.player_id);
        }
        if (action === 'uploadPhoto') {
            if (params.scope === 'new_session') params.member_token = getMemberToken() || await unlockEditing(false);
            if (params.scope === 'session') params.session_token = await ensureSessionToken(params.session_id);
            if (params.scope === 'profile') params.profile_token = getProfileToken(params.player_id);
        }
    }
    const data = await rawApiRequest(action, params, isRead);
    if (data && data.code === 'AUTH_EXPIRED' && MEMBER_ACTIONS.has(action)) setMemberToken('');
    if (data && data.code === 'SESSION_AUTH_REQUIRED' && params.session_id) {
        localStorage.removeItem('lockout_session_token_' + params.session_id);
    }
    if (data && data.revision && currentSession && String(currentSession.session_id) === String(params.session_id)) {
        currentSession.revision = Number(data.revision);
    }
    return data;
}

async function ensurePlayersLoaded() {
    if (playersLoaded) return allPlayers;
    const data = await apiCall('getPlayers', {});
    if (data.error) {
        console.error('Error loading players:', data.error);
        return [];
    }
    allPlayers = data;
    playersLoaded = true;
    for (let i = 0; i < data.length; i++) {
        playerCache[data[i].player_id] = data[i].username;
    }
    return allPlayers;
}

// ============================================
// ELO FUNCTIONS
// ============================================
async function loadEloRatings() {
    const data = await apiCall('getEloRatings', {});
    if (!data.error) {
        eloCache = data;
    }
    return eloCache;
}

function getPlayerElo(playerId) {
    for (let i = 0; i < eloCache.length; i++) {
        if (String(eloCache[i].player_id) === String(playerId)) {
            return eloCache[i];
        }
    }
    return null;
}

function formatEloBadge(playerId) {
    const elo = getPlayerElo(playerId);
    if (!elo) return '';
    const provisional = elo.provisional ? '?' : '';
    return '<span class="elo-badge">⚡ ' + elo.rating + provisional + '</span>';
}

async function displayEloLeaderboard() {
    const data = await loadEloRatings();
    if (!data || data.length === 0) return;
    const medals = ['🥇', '🥈', '🥉'];
    const top = data[0];
    const changeColor = top.change >= 0 ? '#4caf50' : '#f44336';
    const changeSign = top.change >= 0 ? '+' : '';

    let html = '<div class="elo-leaderboard-box">';
    html += '<div class="elo-dropdown-header" onclick="toggleEloDropdown()">';
    html += '<span>⚡ ELO Rankings</span>';
    html += '<span class="elo-dropdown-preview">';
    html += '🥇 ' + top.username + ' ' + top.rating + (top.provisional ? '?' : '');
    html += '<span class="elo-dropdown-arrow" id="eloDropdownArrow"> ▼</span>';
    html += '</span>';
    html += '</div>';
    html += '<div class="elo-leaderboard-list" id="eloDropdownContent" style="display:none;">';
    for (let i = 0; i < data.length; i++) {
        const p = data[i];
        const medal = medals[i] || (i + 1) + '.';
        const pChangeColor = p.change >= 0 ? '#4caf50' : '#f44336';
        const pChangeSign = p.change >= 0 ? '+' : '';
        html += '<div class="elo-leaderboard-row">';
        html += '<span class="elo-rank">' + medal + '</span>';
        html += '<span class="elo-name">' + p.username + '</span>';
        html += '<span class="elo-rating">' + p.rating + (p.provisional ? '?' : '') + '</span>';
        html += '<span class="elo-change-pill" style="background:' + (p.change >= 0 ? '#e8f5e9' : '#ffebee') + '; color:' + pChangeColor + '">' + pChangeSign + p.change + '</span>';
        html += '</div>';
    }
    html += '<p class="elo-footnote">? = provisional (under 50 hands). Change = last session. <a class="elo-footnote-link" onclick="showEloHowTo()">What is ELO?</a></p>';
    html += '</div>';
    html += '</div>';
    document.getElementById('eloLeaderboardSection').innerHTML = html;
}

function showEloHowTo() {
    const intentId = showScreen('appInstructionsScreen');
    setTimeout(function() {
        if (!isCurrentNavigationIntent(intentId)) return;
        const target = document.getElementById('eloHowToSection');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
}

function toggleEloDropdown() {
    const content = document.getElementById('eloDropdownContent');
    const arrow = document.getElementById('eloDropdownArrow');
    if (!content) return;
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    if (arrow) arrow.textContent = isOpen ? ' ▼' : ' ▲';
    hapticFeedback('light');
}

async function showEloStats(requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    const contentDiv = document.getElementById('statsContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-50 mb-10" style="height:22px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-80 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-60 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-80 mb-10" style="height:36px;"></div>' +
        '</div>';

    // Fetch ELO ratings and all history in parallel
    const [ratingsData, sessionsData, allHistoryData] = await Promise.all([
        apiCall('getEloRatings', {}),
        apiCall('getSessionsWithHands', {}),
        apiCall('getEloHistoryAll', {})
    ]);
    if (!isCurrentNavigationIntent(intentId)) return;

    if (ratingsData.error || !ratingsData.length) {
        contentDiv.innerHTML = '<div class="error">No ELO data found. Complete a non-testing session to generate ratings.</div>';
        return;
    }

    eloCache = ratingsData;

    let html = '<h3>⚡ ELO Ratings</h3>';
    html += '<p class="text-muted text-sm mb-20">Rank-based ELO. All players start at 1000. ? = provisional (under 50 hands played).</p>';
    html += '<div class="overflow-x-auto"><table class="scores-table"><tr>';
    html += '<th>Rank</th><th>Player</th><th>Rating</th><th>Last Change</th><th>Hands Played</th>';
    html += '</tr>';
    const medals = ['🥇', '🥈', '🥉'];
    for (let i = 0; i < eloCache.length; i++) {
        const p = eloCache[i];
        const medal = medals[i] || (i + 1);
        const changeColor = p.change >= 0 ? '#4caf50' : '#f44336';
        const changeSign = p.change >= 0 ? '+' : '';
        html += '<tr>';
        html += '<td>' + medal + '</td>';
        html += '<td><strong>' + p.username + '</strong></td>';
        html += '<td><strong>' + p.rating + (p.provisional ? '?' : '') + '</strong></td>';
        html += '<td style="color:' + changeColor + '; font-weight:600;">' + changeSign + p.change + '</td>';
        html += '<td>' + p.hands_played + '</td>';
        html += '</tr>';
    }
    html += '</table></div>';
    html += '<div class="elo-history-section mt-20">';
    html += '<h3>📈 Rating History</h3>';
    html += '<div class="elo-chart-container" id="eloChartContainer"><canvas id="eloHistoryChart"></canvas></div>';
    html += '</div>';

    contentDiv.innerHTML = html;

    // Canvas now exists in the DOM — draw immediately with pre-fetched data
    drawEloHistoryChart(sessionsData, allHistoryData);
}

function drawEloHistoryChart(sessionsData, allHistoryData) {
    const container = document.getElementById('eloChartContainer');
    const ctx = document.getElementById('eloHistoryChart');
    if (!ctx) return;
    if (!sessionsData || !allHistoryData || sessionsData.error || allHistoryData.error) return;
    const colors = CHART_COLORS;

    const completedSessions = sessionsData
        .filter(s => s.session.date_ended && s.session.date_ended !== '')
        .filter(s => !String(s.session.tags || '').toLowerCase().includes('testing'))
        .sort((a, b) => lockoutDateValue(a.session.date_started) - lockoutDateValue(b.session.date_started));

    if (completedSessions.length === 0) return;

    // Group history by player
    const historyByPlayer = {};
    for (let i = 0; i < allHistoryData.length; i++) {
        const entry = allHistoryData[i];
        const pid = String(entry.player_id);
        if (!historyByPlayer[pid]) historyByPlayer[pid] = [];
        historyByPlayer[pid].push(entry);
    }

    const labels = ['Start', ...completedSessions.map(s => s.session.title)];
    const datasets = [];

    for (let i = 0; i < eloCache.length; i++) {
        const p = eloCache[i];
        const history = historyByPlayer[String(p.player_id)] || [];

        const ratingBySession = {};
        for (let j = 0; j < history.length; j++) {
            ratingBySession[String(history[j].session_id)] = Number(history[j].new_rating);
        }

        let lastRating = history.length > 0 ? Number(history[0].old_rating) : 1000;
        const dataPoints = [lastRating];

        for (let j = 0; j < completedSessions.length; j++) {
            const sid = String(completedSessions[j].session.session_id);
            if (ratingBySession[sid] !== undefined) lastRating = ratingBySession[sid];
            dataPoints.push(lastRating);
        }

        datasets.push({
            label: p.username + (p.provisional ? '?' : ''),
            data: dataPoints,
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.1,
            pointRadius: 4
        });
    }

    if (!datasets.length) {
        if (container) container.innerHTML = '<p class="text-muted text-sm" style="padding:15px;">Not enough session data to plot a history chart yet.</p>';
        return;
    }
    const isMobile = window.innerWidth < 600;
    const shortLabels = labels.map(l => l.length > 8 ? l.substring(0, 8) + '…' : l);

    if (window._eloHistoryChart) window._eloHistoryChart.destroy();
    window._eloHistoryChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: { labels: isMobile ? shortLabels : labels, datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: { display: true, text: 'ELO Rating History' },
                legend: {
                    display: true,
                    position: isMobile ? 'bottom' : 'top',
                    labels: { font: { size: isMobile ? 10 : 12 }, boxWidth: 12 }
                }
            },
            scales: {
                x: {
                    ticks: {
                        maxRotation: isMobile ? 45 : 30,
                        font: { size: isMobile ? 9 : 11 }
                    }
                },
                y: {
                    title: { display: true, text: 'Rating' },
                    ticks: { font: { size: isMobile ? 10 : 12 } }
                }
            }
        }
    });
}

// ============================================
// LOCKOUT VALIDATION
// ============================================
function determineFalseLockout(scores, lockoutPlayerId) {
    const lockoutPlayer = scores.find(s => String(s.player_id) === String(lockoutPlayerId));
    if (!lockoutPlayer) return { isFalseLockout: true, lockoutPlayerScore: 0, lowestScore: 0, playersWithLowest: [] };
    const lockoutPlayerScore = lockoutPlayer.score;
    const lowestScore = Math.min(...scores.map(s => s.score));
    const playersWithLowest = scores.filter(s => s.score === lowestScore);
    const hasStrictlyLowest = lockoutPlayerScore === lowestScore && playersWithLowest.length === 1;
    return {
        isFalseLockout: lockoutPlayerScore > 5 || !hasStrictlyLowest,
        lockoutPlayerScore,
        lowestScore,
        playersWithLowest
    };
}

function buildLockoutWarningMessage(playerName, lockoutPlayerScore, lowestScore, playersWithLowest, getPlayerNameFn) {
    let message = '<strong>⚠️ Warning:</strong> ';
    if (lockoutPlayerScore > 5) {
        message += playerName + ' has a score of ' + lockoutPlayerScore + ' (max allowed: 5). This will be marked as a <strong>FALSE LOCKOUT</strong>.';
    } else if (lockoutPlayerScore > lowestScore) {
        const lowestPlayers = playersWithLowest.map(s => getPlayerNameFn(s.player_id)).join(', ');
        message += playerName + ' does NOT have the lowest score. ' + lowestPlayers + ' has the lowest (' + lowestScore + '). This will be marked as a <strong>FALSE LOCKOUT</strong>.';
    } else if (playersWithLowest.length > 1) {
        const tiedPlayers = playersWithLowest.map(s => getPlayerNameFn(s.player_id)).join(', ');
        message += playerName + ' is TIED for lowest score with ' + tiedPlayers + '. This will be marked as a <strong>FALSE LOCKOUT</strong>.';
    }
    return message;
}

// ============================================
// HAPTIC FEEDBACK
// ============================================

function hapticFeedback(style) {
    if ('vibrate' in navigator) {
        switch(style) {
            case 'light': navigator.vibrate(10); break;
            case 'medium': navigator.vibrate(20); break;
            case 'heavy': navigator.vibrate(50); break;
            case 'success': navigator.vibrate([10, 50, 10]); break;
            case 'error': navigator.vibrate([50, 100, 50]); break;
            default: navigator.vibrate(15);
        }
    }
}

// ============================================
// CONFETTI CELEBRATION
// ============================================
function closeSessionEndPopup() {
    document.getElementById('sessionEndPopup').style.display = 'none';
}

function celebrateWinner(winnerName) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:99999;pointer-events:none;';
    document.body.appendChild(canvas);
    const myConfetti = confetti.create(canvas, { resize: true });
    myConfetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    setTimeout(function() { myConfetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } }); }, 250);
    setTimeout(function() { myConfetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } }); }, 400);
    setTimeout(function() { document.body.removeChild(canvas); }, 4000);
}

function getPlayerName(playerId) {
    return playerCache[playerId] || 'Unknown';
}

function parseLockoutDate(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value === 'number') {
        const numericDate = new Date(value);
        return isNaN(numericDate.getTime()) ? null : numericDate;
    }
    const text = String(value === undefined || value === null ? '' : value).trim();
    if (!text || text === '[object Object]') return null;
    const ukMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (ukMatch) {
        const localDate = new Date(
            Number(ukMatch[3]),
            Number(ukMatch[2]) - 1,
            Number(ukMatch[1]),
            Number(ukMatch[4] || 0),
            Number(ukMatch[5] || 0),
            Number(ukMatch[6] || 0)
        );
        return isNaN(localDate.getTime()) ? null : localDate;
    }
    const parsedDate = new Date(text);
    return isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function lockoutDateValue(value) {
    const date = parseLockoutDate(value);
    return date ? date.getTime() : 0;
}

function formatUKDate(value) {
    const d = parseLockoutDate(value);
    if (!d) return 'Unknown';
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' +
           d.getFullYear();
}

function calculateAverageHand(handScores) {
    const scores = (handScores || [])
        .map(function(item) { return Number(item && typeof item === 'object' ? item.score : item); })
        .filter(function(score) { return Number.isFinite(score); });
    if (scores.length === 0) return '0';
    return (scores.reduce(function(total, score) { return total + score; }, 0) / scores.length).toFixed(2);
}

function formatPoints(value) {
    const number = Number(value);
    return String(value) + (number === 1 ? ' point' : ' points');
}

function escapeAttr(str) {
    return escapeHtml(str);
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function decodeHtml(str) {
    const doc = new DOMParser().parseFromString(String(str || ''), 'text/html');
    return doc.documentElement.textContent || '';
}

function parsePlayerJoinInfo(joinInfoString) {
    if (!joinInfoString || joinInfoString === '' || joinInfoString === '{}') return {};
    try {
        const parsed = JSON.parse(joinInfoString);
        const result = {};
        for (let playerId in parsed) {
            const value = parsed[playerId];
            if (typeof value === 'object' && value.hand !== undefined) {
                result[playerId] = value.hand;
            } else if (typeof value === 'number') {
                result[playerId] = value;
            }
        }
        return result;
    } catch(e) { return {}; }
}

function getPlayerStartingScore(playerId) {
    if (!currentSession || !currentSession.player_join_info) return 0;
    try {
        const fullInfo = JSON.parse(currentSession.player_join_info);
        const info = fullInfo[playerId];
        if (!info) return 0;
        if (typeof info === 'object' && info.starting_score !== undefined) return info.starting_score;
    } catch(e) {}
    return 0;
}

function getPlayerJoinHand(playerId) {
    if (!currentSession || !currentSession.player_join_info) return 1;
    const joinInfo = parsePlayerJoinInfo(currentSession.player_join_info);
    return joinInfo[playerId] || 1;
}

// ============================================
// IMAGE UPLOAD (proxied by Apps Script; the provider key never reaches the browser)
// ============================================

async function uploadToImgur(file) {
    try {
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
            return { error: 'Use a JPEG, PNG, WebP, or GIF image.' };
        }
        if (file.size > 2 * 1024 * 1024) return { error: 'Image must be smaller than 2 MB.' };
        const dataUrl = await new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = function() { reject(new Error('Could not read the image.')); };
            reader.readAsDataURL(file);
        });
        const context = window._photoUploadContext || { scope: 'new_session' };
        const result = await apiCall('uploadPhoto', Object.assign({}, context, {
            image_base64: String(dataUrl).split(',')[1],
            mime_type: file.type,
            file_name: file.name
        }));
        if (result.error) return { error: result.error };
        return { url: result.url };
    } catch(e) {
        return { error: e.message };
    }
}

function createPhotoUploadUI(currentPhotoUrl, onUploadComplete) {
    let html = '<div class="photo-upload-section">';
    if (currentPhotoUrl && currentPhotoUrl !== '') {
        html += '<div class="photo-preview-container">';
        html += '<img src="' + currentPhotoUrl + '" class="session-photo-preview" onclick="openPhotoFullscreen(\'' + currentPhotoUrl + '\')">';
        html += '<button class="btn btn-danger btn-small mt-10" onclick="removeSessionPhoto()">🗑️ Remove Photo</button>';
        html += '</div>';
    }
    html += '<label class="photo-upload-label">';
    html += '<input type="file" id="photoFileInput" accept="image/*" style="display:none;" onchange="handlePhotoUpload(event)">';
    html += '<span class="btn btn-info btn-small">📷 ' + (currentPhotoUrl ? 'Change Photo' : 'Add Photo') + '</span>';
    html += '</label>';
    html += '<div id="photoUploadStatus"></div>';
    html += '</div>';
    return html;
}

async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const statusDiv = document.getElementById('photoUploadStatus');
    statusDiv.innerHTML = '<div class="loading">⏳ Uploading photo...</div>';
    const result = await uploadToImgur(file);
    if (result.error) {
        statusDiv.innerHTML = '<div class="error">❌ Upload failed: ' + result.error + '</div>';
        return;
    }
    window._pendingPhotoUrl = result.url;
    statusDiv.innerHTML = '<div class="success">✅ Photo ready</div>';
    const preview = document.querySelector('.session-photo-preview');
    if (preview) {
        preview.src = result.url;
    } else {
        const container = document.querySelector('.photo-upload-section');
        if (container) {
            const previewHtml = '<div class="photo-preview-container"><img src="' + result.url + '" class="session-photo-preview" onclick="openPhotoFullscreen(\'' + result.url + '\')"></div>';
            container.insertAdjacentHTML('afterbegin', previewHtml);
        }
    }
}

function removeSessionPhoto() {
    window._pendingPhotoUrl = '';
    const container = document.querySelector('.photo-preview-container');
    if (container) container.remove();
    const statusDiv = document.getElementById('photoUploadStatus');
    if (statusDiv) statusDiv.innerHTML = '';
}

function openPhotoFullscreen(url) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:10000;display:flex;align-items:center;justify-content:center;cursor:pointer;';
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Full-size uploaded photo';
    image.style.cssText = 'max-width:95%;max-height:95%;border-radius:8px;object-fit:contain;';
    overlay.appendChild(image);
    overlay.onclick = function() { document.body.removeChild(overlay); };
    document.body.appendChild(overlay);
}

// ============================================
// SCREEN NAVIGATION
// ============================================
function showScreen(screenId, skipHistory, requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    if (!isCurrentNavigationIntent(intentId)) return false;

    const screens = document.querySelectorAll('.screen');
    const currentScreen = document.querySelector('.screen.active');
    if (currentScreen) {
        currentScreen.style.opacity = '0';
        currentScreen.style.transform = 'translateY(-10px)';
    }

    if (screenTransitionTimer) clearTimeout(screenTransitionTimer);
    screenTransitionTimer = setTimeout(function() {
        if (!isCurrentNavigationIntent(intentId)) return;
        for (let i = 0; i < screens.length; i++) {
            screens[i].classList.remove('active');
            screens[i].style.opacity = '';
            screens[i].style.transform = '';
        }
        const destination = document.getElementById(screenId);
        if (!destination) return;
        destination.classList.add('active');
        window.scrollTo(0, 0);
        screenTransitionTimer = null;
    }, 150);

    if (!skipHistory) history.pushState({ screen: screenId }, '', '#' + screenId);
    if (screenId === 'startSessionScreen') {
        setTimeout(function() {
            if (isCurrentNavigationIntent(intentId)) loadPlayersForSession();
        }, 150);
    }
    if (screenId === 'homeScreen') {
        setTimeout(function() {
            if (!isCurrentNavigationIntent(intentId)) return;
            checkActiveSessions();
            displayEloLeaderboard();
        }, 150);
    }
    return intentId;
}

// ============================================
// PLAYER MANAGEMENT
// ============================================
async function loadPlayersForSession() {
    await ensurePlayersLoaded();
    const hostSelect = document.getElementById('sessionHost');
    hostSelect.innerHTML = '<option value="">Select host...</option>';
    for (let i = 0; i < allPlayers.length; i++) {
        hostSelect.innerHTML += '<option value="' + allPlayers[i].player_id + '">' + allPlayers[i].username + '</option>';
    }
    const playerList = document.getElementById('playerSelectionList');
    let html = '<ul class="player-list">';
    for (let i = 0; i < allPlayers.length; i++) {
        html += '<li class="player-item"><label><input type="checkbox" value="' + allPlayers[i].player_id + '" class="player-checkbox"> ' + allPlayers[i].username + '</label></li>';
    }
    html += '</ul>';
    playerList.innerHTML = html;
    window._pendingPhotoUrl = '';
    window._photoUploadContext = { scope: 'new_session' };
    document.getElementById('createSessionPhotoUpload').innerHTML = createPhotoUploadUI('', null);
}

async function addPlayer(event) {
    const username = document.getElementById('newPlayerName').value.trim();
    const messageDiv = document.getElementById('addPlayerMessage');
    if (!username) { messageDiv.innerHTML = '<div class="error">Please enter a player name</div>'; return; }
    const intentId = beginNavigationIntent();
    const addBtn = event.target;
    setButtonLoading(addBtn, true);
const data = await apiCall('addPlayer', { username: username, editor_name: username });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">⚠️ ' + data.error + '</div>';
        setButtonLoading(addBtn, false);
    } else {
        messageDiv.innerHTML = '<div class="success">Player added!</div>';
        document.getElementById('newPlayerName').value = '';
        playersLoaded = false;
        setTimeout(function() {
            showScreen('homeScreen', false, intentId);
            setButtonLoading(addBtn, false);
        }, 1500);
    }
}

// ============================================
// ADD PLAYER TO ACTIVE SESSION
// ============================================
async function showAddPlayerModal() {
    await ensurePlayersLoaded();
    const currentPlayerIds = sessionPlayers.map(p => String(p.player_id));
    const availablePlayers = allPlayers.filter(p => currentPlayerIds.indexOf(String(p.player_id)) === -1);
    if (availablePlayers.length === 0) { alert('All players are already in this session!'); return; }
    const playerList = document.getElementById('addPlayerList');
    let html = '<ul class="player-list">';
    for (let i = 0; i < availablePlayers.length; i++) {
        const player = availablePlayers[i];
        html += '<li class="player-item"><label><input type="radio" name="addPlayerRadio" value="' + player.player_id + '" onchange="selectPlayerToAdd(' + player.player_id + ', \'' + player.username + '\')"> ' + player.username + '</label></li>';
    }
    html += '</ul>';
    playerList.innerHTML = html;
    selectedPlayerToAdd = null;
    document.getElementById('confirmAddPlayerBtn').disabled = true;
    document.getElementById('addPlayerConfirm').style.display = 'none';
    document.getElementById('addPlayerToSessionMessage').innerHTML = '';
    document.getElementById('addPlayerModal').classList.add('active');
}

function selectPlayerToAdd(playerId, playerName) {
    selectedPlayerToAdd = playerId;
    document.getElementById('confirmAddPlayerBtn').disabled = false;
    const confirmDiv = document.getElementById('addPlayerConfirm');
    const confirmText = document.getElementById('addPlayerConfirmText');
    confirmText.innerHTML = '<strong>' + playerName + '</strong> will join from <strong>Hand ' + currentHandNumber + '</strong> onwards.';
    confirmDiv.style.display = 'block';
}

async function confirmAddPlayer() {
    if (!selectedPlayerToAdd) return;
    const messageDiv = document.getElementById('addPlayerToSessionMessage');
    const addBtn = document.getElementById('confirmAddPlayerBtn');
    if (addBtn) setButtonLoading(addBtn, true);
    messageDiv.innerHTML = '<div class="loading">Adding player...</div>';
    let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
    const data = await apiCall('addPlayerToSession', {
        session_id: currentSession.session_id,
        player_id: selectedPlayerToAdd,
        join_hand_number: currentHandNumber,
        editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
    });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
        if (addBtn) setButtonLoading(addBtn, false);
    } else {
        const startingScore = data.starting_score || 0;
        messageDiv.innerHTML = '<div class="success">Player added successfully!' + (startingScore > 0 ? ' (Starting with ' + startingScore + ' points)' : '') + '</div>';
        currentSession.players_involved = data.players_involved;
        currentSession.player_join_info = data.player_join_info;
        const newPlayer = allPlayers.find(p => String(p.player_id) === String(selectedPlayerToAdd));
        if (newPlayer) sessionPlayers.push(newPlayer);
        setTimeout(function() {
            closeAddPlayerModal();
            showActiveSession();
            updateSessionScores();
            if (addBtn) setButtonLoading(addBtn, false);
        }, 1500);
    }
}

function closeAddPlayerModal() {
    document.getElementById('addPlayerModal').classList.remove('active');
    document.getElementById('addPlayerToSessionMessage').innerHTML = '';
    selectedPlayerToAdd = null;
}

// ============================================
// SESSION MANAGEMENT
// ============================================
async function checkActiveSessions() {
    await ensurePlayersLoaded();

    const sessionsWithHands = await apiCall('getSessionsWithHands', {});
    if (sessionsWithHands.error) {
        document.getElementById('activeSessionsSection').innerHTML = '<p style="color: #c33;">Error loading sessions</p>';
        return;
    }

    const activeSessions = sessionsWithHands.filter(item => {
        const dateEnded = item.session.date_ended;
        return !dateEnded || dateEnded === '' || dateEnded.toString().trim() === '';
    });

    if (activeSessions.length === 0) {
        document.getElementById('activeSessionsSection').innerHTML =
            '<div class="no-active-sessions-box">' +
                '<p>🎴 No active sessions</p>' +
                '<p class="text-muted text-sm">Start a new session to begin tracking!</p>' +
            '</div>';
        return;
    }
    let html = '<div class="active-session-box">';
        html += '<h3>Active Sessions</h3>';
        html += '<div class="active-sessions-scroll">';

        for (let i = 0; i < activeSessions.length; i++) {
            const session = activeSessions[i].session;
            const handsData = activeSessions[i].hands;
            const handCount = handsData.length > 0 ? Math.max(...handsData.map(h => h.hand_number)) : 0;
            const playerIds = session.players_involved.split(',');
            const playerScores = {};
            const playerLockouts = {};
            const playerFalseLockouts = {};

            let fullJoinInfo = {};
            try { fullJoinInfo = JSON.parse(session.player_join_info || '{}'); } catch (e) {}
            for (let p = 0; p < playerIds.length; p++) {
                const pid = playerIds[p];
                const joinRecord = fullJoinInfo[pid];
                playerScores[pid] = joinRecord && typeof joinRecord === 'object'
                    ? Number(joinRecord.starting_score || 0)
                    : 0;
                playerLockouts[pid] = 0;
                playerFalseLockouts[pid] = 0;
            }

            const handsByNumber = {};
            for (let h = 0; h < handsData.length; h++) {
                const hand = handsData[h];
                if (playerScores[hand.player_id] !== undefined) playerScores[hand.player_id] += Number(hand.score);
                if (!handsByNumber[hand.hand_number]) handsByNumber[hand.hand_number] = [];
                handsByNumber[hand.hand_number].push(hand);
            }
            const sortedHandNumbers = Object.keys(handsByNumber).sort((a, b) => Number(a) - Number(b));
            const currentStreaks = {};
            for (let p = 0; p < playerIds.length; p++) currentStreaks[playerIds[p]] = 0;
            for (let h = 0; h < sortedHandNumbers.length; h++) {
                const hands = handsByNumber[sortedHandNumbers[h]];
                const lockoutPlayerThisHand = hands.find(hand => hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id));
                for (let p = 0; p < playerIds.length; p++) {
                    const pid = playerIds[p];
                    if (lockoutPlayerThisHand && String(lockoutPlayerThisHand.player_id) === String(pid)) {
                        if (lockoutPlayerThisHand.false_lockout == 1 || lockoutPlayerThisHand.false_lockout === true) {
                            playerFalseLockouts[pid]++;
                            currentStreaks[pid] = 0;
                        } else {
                            playerLockouts[pid]++;
                            currentStreaks[pid]++;
                        }
                    } else {
                        currentStreaks[pid] = 0;
                    }
                }
            }

            let leaderId = null;
            let lowestScore = Infinity;
            for (let pid in playerScores) {
                if (playerScores[pid] < lowestScore) { lowestScore = playerScores[pid]; leaderId = pid; }
            }

            html += '<div class="active-session-item active-session-card">';
            html += '<div class="active-session-card-header">';
            html += '<div class="active-session-card-title"><strong>🎮 ' + session.title + '</strong></div>';
            html += '<div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">';
            if (session.photo_url && session.photo_url !== '') {
                html += '<img src="' + session.photo_url + '" style="width:40px;height:40px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation(); openPhotoFullscreen(\'' + session.photo_url + '\')">';
            }
            html += '<button class="btn btn-success btn-small active-session-resume-btn" onclick="resumeSession(' + session.session_id + ', this)">Resume</button>';
            html += '</div>';
            html += '</div>';
            html += '<div class="active-session-stat-grid">';
            html += '<div class="active-session-stat-cell"><div class="active-session-stat-label">🎴 HAND</div><div class="active-session-stat-value">' + handCount + '</div></div>';
            html += '<div class="active-session-stat-cell"><div class="active-session-stat-label">👥 PLAYERS</div><div class="active-session-stat-value">' + playerIds.length + '</div></div>';
            html += '</div>';

            if (leaderId) {
                html += '<div class="active-session-leader-box">';
                html += '<div class="active-session-leader-name">🏆 <span class="player-link" style="color:var(--success-dark);" onclick="event.stopPropagation(); showPlayerProfile(' + leaderId + ')">' + getPlayerName(leaderId) + '</span> leading</div>';
                html += '<div class="active-session-leader-score">' + formatPoints(playerScores[leaderId]) + '</div>';
                html += '</div>';
            }

            for (let pid in currentStreaks) {
                if (currentStreaks[pid] >= 2) {
                    html += '<div class="active-session-streak-box">🔥 <strong>' + getPlayerName(pid) + ':</strong> ' + currentStreaks[pid] + ' lockout streak</div>';
                }
            }

            html += '</div>';
        }

        html += '</div></div>';
        document.getElementById('activeSessionsSection').innerHTML = html;
}

async function createSession(event) {
    const title = document.getElementById('sessionTitle').value.trim();
    const hostId = document.getElementById('sessionHost').value;
    const checkboxes = document.querySelectorAll('.player-checkbox:checked');
    const selectedPlayers = [];
    for (let i = 0; i < checkboxes.length; i++) selectedPlayers.push(checkboxes[i].value);
    const notes = document.getElementById('sessionNotes').value.trim();
    const tagsSelect = document.getElementById('sessionTags');
    const selectedTags = [];
    for (let i = 0; i < tagsSelect.options.length; i++) {
        if (tagsSelect.options[i].selected) selectedTags.push(tagsSelect.options[i].value);
    }
    const tags = selectedTags.join(',');
    const penalty = document.getElementById('falseLockoutPenalty').value.trim();
    const messageDiv = document.getElementById('sessionMessage');
    if (!title || !hostId || selectedPlayers.length === 0) {
        messageDiv.innerHTML = '<div class="error">Please fill all required fields</div>';
        return;
    }
    const createBtn = event.target;
    setButtonLoading(createBtn, true);
    const existingTitles = allSessions.map(s => s.title.toLowerCase().trim());
    if (existingTitles.includes(title.toLowerCase().trim())) {
        messageDiv.innerHTML = '<div class="error">⚠️ A session named "' + escapeHtml(title) + '" already exists.</div>';
        setButtonLoading(createBtn, false);
        return;
    }
    const data = await apiCall('createSession', {
        title: title, host_player_id: hostId, players_involved: selectedPlayers.join(','),
        notes: notes, tags: tags, false_lockout_penalty: penalty
    });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
        setButtonLoading(createBtn, false);
    } else {
        setSessionToken(data.session_id, data.session_token);
        currentSession = {
            session_id: data.session_id, title: title, host_player_id: hostId,
            notes: escapeHtml(notes), tags: escapeHtml(tags), player_join_info: '{}',
            players_involved: selectedPlayers.join(','), false_lockout_penalty: penalty,
            photo_url: '', revision: Number(data.revision || 1)
        };
        if (window._pendingPhotoUrl) {
            const photoData = await apiCall('updateSessionPhoto', {
                session_id: data.session_id,
                photo_url: window._pendingPhotoUrl,
                editor_name: hostId
            });
            if (!photoData.error) currentSession.photo_url = window._pendingPhotoUrl;
            else messageDiv.innerHTML = '<div class="error">Session created, but the photo could not be attached: ' + photoData.error + '</div>';
            window._pendingPhotoUrl = '';
        }
        if (data.edit_code) await showSessionEditCode(data.edit_code);
        sessionPlayers = [];
        for (let i = 0; i < allPlayers.length; i++) {
            if (selectedPlayers.indexOf(String(allPlayers[i].player_id)) !== -1) sessionPlayers.push(allPlayers[i]);
        }
        currentHandNumber = 1;
        document.getElementById('sessionScores').innerHTML = '';
        document.getElementById('handHistorySection').style.display = 'none';
        document.getElementById('activeSessionCharts').innerHTML = '';
        showActiveSession();
        setButtonLoading(createBtn, false);
    }
}

async function resumeSession(sessionId, buttonElement, requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    if (buttonElement) setButtonLoading(buttonElement, true);
    const sessionData = await apiCall('getSession', { session_id: sessionId });
    if (!isCurrentNavigationIntent(intentId)) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    if (sessionData.error) {
        alert('Error loading session: ' + sessionData.error);
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    const playerIds = sessionData.players_involved.split(',');
    sessionPlayers = [];
    for (let i = 0; i < playerIds.length; i++) {
        const player = allPlayers.find(p => String(p.player_id) === String(playerIds[i]));
        if (player) sessionPlayers.push(player);
    }
    currentSession = {
        session_id: sessionData.session_id, title: sessionData.title,
        host_player_id: sessionData.host_player_id, notes: sessionData.notes || '',
        tags: sessionData.tags || '', player_join_info: sessionData.player_join_info || '{}',
        players_involved: sessionData.players_involved,
        false_lockout_penalty: sessionData.false_lockout_penalty || 10,
        photo_url: sessionData.photo_url || '',
        revision: Number(sessionData.revision || 1)
    };
    const handsData = await apiCall('getHands', { session_id: sessionId });
    if (!isCurrentNavigationIntent(intentId)) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    currentHandNumber = (handsData.error || handsData.length === 0) ? 1 : Math.max(...handsData.map(h => h.hand_number)) + 1;
    showActiveSession(intentId);
    updateSessionScores();
    if (buttonElement) setButtonLoading(buttonElement, false);
}

function showActiveSession(requestedIntentId) {
    document.getElementById('activeSessionTitle').textContent = currentSession.title;
    let playerNames = sessionPlayers.map(p => {
        const joinHand = getPlayerJoinHand(p.player_id);
        const eloBadge = formatEloBadge(p.player_id);
        if (joinHand > 1) return p.username + ' <span class="late-join-badge">Joined H' + joinHand + '</span> ' + eloBadge;
        return p.username + ' ' + eloBadge;
    }).join(', ');
    document.getElementById('activeSessionInfo').innerHTML =
        '<p><strong>Session ID:</strong> ' + currentSession.session_id + '</p>' +
        '<p><strong>Players:</strong> ' + playerNames + '</p>';
    displaySessionMetadata('activeSessionMetadata');
    setupHandInputs();
    document.getElementById('sessionScores').innerHTML = '';
    document.getElementById('handHistorySection').style.display = 'none';
    document.getElementById('activeSessionCharts').innerHTML = '';
    document.getElementById('activeHandHistoryBottom').innerHTML = '';
    updateSessionScores();
    showScreen('activeSessionScreen', false, requestedIntentId);
}

function displaySessionMetadata(containerId) {
    const container = document.getElementById(containerId);
    if (!currentSession) return;
    let html = '';
    if (currentSession.notes || currentSession.tags) {
        html += '<div class="session-metadata">';
        if (currentSession.notes) html += '<p><strong>📝 Notes:</strong> ' + currentSession.notes + '</p>';
        if (currentSession.tags) {
            const tagsArray = currentSession.tags.split(',').filter(t => t.trim());
            if (tagsArray.length > 0) {
                html += '<p><strong>🏷️ Tags:</strong> ';
                for (let i = 0; i < tagsArray.length; i++) html += '<span class="tag-badge">' + tagsArray[i] + '</span>';
                html += '</p>';
            }
        }
        html += '</div>';
    }
    if (currentSession.photo_url && currentSession.photo_url !== '') {
        html += '<div class="session-photo-container"><img src="' + currentSession.photo_url + '" class="session-photo-full" onclick="openPhotoFullscreen(\'' + currentSession.photo_url + '\')"></div>';
    }
    container.innerHTML = html;
}

function showEditSessionModal() {
    document.getElementById('editSessionNotes').value = decodeHtml(currentSession.notes || '');
    window._pendingPhotoUrl = currentSession.photo_url || '';
    window._photoUploadContext = { scope: 'session', session_id: currentSession.session_id };
    document.getElementById('editSessionPhotoUpload').innerHTML = createPhotoUploadUI(currentSession.photo_url || '', null);
    const tagsSelect = document.getElementById('editSessionTags');
    const currentTags = (currentSession.tags || '').split(',').filter(t => t.trim());
    for (let i = 0; i < tagsSelect.options.length; i++) {
        tagsSelect.options[i].selected = currentTags.indexOf(tagsSelect.options[i].value) !== -1;
    }
    document.getElementById('editSessionModal').classList.add('active');
}

async function saveEditedSession(event) {
    const notes = document.getElementById('editSessionNotes').value.trim();
    const tagsSelect = document.getElementById('editSessionTags');
    const selectedTags = [];
    for (let i = 0; i < tagsSelect.options.length; i++) {
        if (tagsSelect.options[i].selected) selectedTags.push(tagsSelect.options[i].value);
    }
    const tags = selectedTags.join(',');
    const saveBtn = event.target;
    setButtonLoading(saveBtn, true);
    let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
    const data = await apiCall('updateSession', {
        session_id: currentSession.session_id, notes: notes, tags: tags,
        editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
    });
    const messageDiv = document.getElementById('editSessionMessage');
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
        setButtonLoading(saveBtn, false);
    } else {
        currentSession.notes = escapeHtml(notes);
        currentSession.tags = escapeHtml(tags);
        if (window._pendingPhotoUrl !== undefined) {
            const photoData = await apiCall('updateSessionPhoto', {
                session_id: currentSession.session_id,
                photo_url: window._pendingPhotoUrl,
                editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
            });
            if (photoData.error) {
                messageDiv.innerHTML = '<div class="error">Details saved, but the photo could not be updated: ' + photoData.error + '</div>';
                setButtonLoading(saveBtn, false);
                return;
            }
            currentSession.photo_url = window._pendingPhotoUrl;
        }
        messageDiv.innerHTML = '<div class="success">Session updated!</div>';
        displaySessionMetadata('activeSessionMetadata');
        setTimeout(function() { closeEditSessionModal(); setButtonLoading(saveBtn, false); }, 1000);
    }
}

function closeEditSessionModal() {
    document.getElementById('editSessionModal').classList.remove('active');
    document.getElementById('editSessionMessage').innerHTML = '';
}

async function endSession(event) {
    if (!confirm('End this session?')) return;
    const intentId = beginNavigationIntent();
    const endBtn = event.target;
    setButtonLoading(endBtn, true);
    let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
    const data = await apiCall('closeSession', {
        session_id: currentSession.session_id,
        editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
    });
    if (data.error) {
        alert('❌ Failed to end session. Please try again.\n\n' + data.error);
        hapticFeedback('error');
        setButtonLoading(endBtn, false);
        return;
    }
    if (!isCurrentNavigationIntent(intentId)) {
        currentSession = null;
        setButtonLoading(endBtn, false);
        return;
    }
    const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
    if (!isCurrentNavigationIntent(intentId)) {
        currentSession = null;
        setButtonLoading(endBtn, false);
        return;
    }
    const playerTotals = {};
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        playerTotals[player.player_id] = { username: player.username, total: getPlayerStartingScore(player.player_id) };
    }
    for (let i = 0; i < handsData.length; i++) {
        const hand = handsData[i];
        if (playerTotals[hand.player_id]) playerTotals[hand.player_id].total += Number(hand.score);
    }
    const scores = Object.values(playerTotals).sort((a, b) => a.total - b.total);
    const winner = scores[0];
    const isTie = scores.length > 1 && scores[1].total === winner.total;
    hapticFeedback('success');
    setButtonLoading(endBtn, false);
    currentSession = null;
    showScreen('homeScreen', false, intentId);
    checkActiveSessions();
    setTimeout(function() {
        eloCache = [];
        displayEloLeaderboard();
    }, 3000);
    setTimeout(function() {
        const popup = document.getElementById('sessionEndPopup');
        document.getElementById('sessionEndTitle').textContent = isTie ? 'Tie game!' : winner.username + ' wins!';
        document.getElementById('sessionEndScore').textContent = formatPoints(winner.total);
        popup.style.display = 'flex';
        if (!isTie) celebrateWinner(winner.username);
    }, 300);
}

// ============================================
// HAND INPUT & SUBMISSION
// ============================================
function setupHandInputs() {
    document.getElementById('currentHandNumber').textContent = currentHandNumber;
    document.getElementById('handMessage').innerHTML = '';
    document.getElementById('handComment').value = '';
    document.getElementById('lockoutWarning').style.display = 'none';
    const handInputs = document.getElementById('handInputs');
    let html = '';
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        const joinHand = getPlayerJoinHand(player.player_id);
        if (joinHand <= currentHandNumber) {
            html += '<div class="player-hand-row">' +
                '<label for="score_' + player.player_id + '">' + player.username + (joinHand > 1 ? ' <span class="late-join-badge">H' + joinHand + '</span>' : '') + '</label>' +
                '<input type="number" id="score_' + player.player_id + '" aria-label="Score for ' + escapeAttr(decodeHtml(player.username)) + '" placeholder="Score" min="-2" oninput="checkLockoutValidity()">' +
                '<label style="display: flex; align-items: center; gap: 5px; margin: 0;"><input type="radio" name="lockout_player" aria-label="' + escapeAttr(decodeHtml(player.username)) + ' locked out" value="' + player.player_id + '" onchange="checkLockoutValidity()"> Locked Out</label>' +
                '</div>';
        }
    }
    handInputs.innerHTML = html;
}

function checkLockoutValidity() {
    const warningDiv = document.getElementById('lockoutWarning');
    const lockoutRadio = document.querySelector('input[name="lockout_player"]:checked');
    if (!lockoutRadio) { warningDiv.style.display = 'none'; return; }
    const lockoutPlayerId = lockoutRadio.value;
    const scores = [];
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        if (getPlayerJoinHand(player.player_id) <= currentHandNumber) {
            const scoreVal = document.getElementById('score_' + player.player_id).value.trim();
            if (scoreVal === '') { warningDiv.style.display = 'none'; return; }
            scores.push({ player_id: player.player_id, score: parseFloat(scoreVal) });
        }
    }
    const { isFalseLockout, lockoutPlayerScore, lowestScore, playersWithLowest } = determineFalseLockout(scores, lockoutPlayerId);
    if (isFalseLockout) {
        warningDiv.innerHTML = buildLockoutWarningMessage(getPlayerName(lockoutPlayerId), lockoutPlayerScore, lowestScore, playersWithLowest, getPlayerName);
        warningDiv.style.display = 'block';
        hapticFeedback('error');
    } else {
        warningDiv.style.display = 'none';
    }
}

async function submitHand(event) {
    const messageDiv = document.getElementById('handMessage');
    const submitBtn = event.target;
    setButtonLoading(submitBtn, true);
    const scores = [];
    const lockoutRadio = document.querySelector('input[name="lockout_player"]:checked');
    if (!lockoutRadio) {
        messageDiv.innerHTML = '<div class="error">Please select who locked out</div>';
        setButtonLoading(submitBtn, false);
        return;
    }
    const lockoutPlayerId = lockoutRadio.value;
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        const joinHand = getPlayerJoinHand(player.player_id);
        if (joinHand <= currentHandNumber) {
            const scoreInput = document.getElementById('score_' + player.player_id);
            const scoreVal = scoreInput.value.trim();
            if (scoreVal === '') { messageDiv.innerHTML = '<div class="error">Please enter all scores</div>'; setButtonLoading(submitBtn, false); return; }
            const scoreNum = parseFloat(scoreVal);
            if (scoreNum < MIN_SCORE) { messageDiv.innerHTML = '<div class="error">Minimum score is -2 (two Red Kings)</div>'; hapticFeedback('error'); setButtonLoading(submitBtn, false); return; }
            scores.push({ player_id: player.player_id, score: scoreNum });
        }
    }
    const { isFalseLockout, lockoutPlayerScore } = determineFalseLockout(scores, lockoutPlayerId);
    let falseLockout = isFalseLockout;
    if (document.getElementById('lockoutWarning').style.display === 'block') {
        if (!confirm('This will be marked as a FALSE LOCKOUT. Continue?')) { setButtonLoading(submitBtn, false); return; }
    }
    let penalty = 10;
    if (currentSession.false_lockout_penalty) penalty = Number(currentSession.false_lockout_penalty);
    const lockoutScoreValue = lockoutPlayerScore;
    for (let i = 0; i < scores.length; i++) {
        if (String(scores[i].player_id) === String(lockoutPlayerId)) {
            scores[i].score = falseLockout ? lockoutScoreValue + penalty : (lockoutScoreValue < 0 ? lockoutScoreValue : 0);
            break;
        }
    }
    const comment = document.getElementById('handComment').value.trim();
    let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
    const data = await apiCall('addHand', {
        session_id: currentSession.session_id, hand_number: currentHandNumber,
        scores: JSON.stringify(scores), lockout_player_id: lockoutPlayerId,
        false_lockout: falseLockout, editor_name: hostPlayer ? hostPlayer.username : 'Unknown',
        comment: comment, lockout_score: lockoutScoreValue
    });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">❌ Failed to save hand. Please try again. (' + data.error + ')</div>';
        hapticFeedback('error');
        setButtonLoading(submitBtn, false);
    } else {
        currentHandNumber++;
        hapticFeedback('success');
        setupHandInputs();
        updateSessionScores();
        setButtonLoading(submitBtn, false);
    }
}

// ============================================
// HAND HISTORY & EDITING
// ============================================
async function displayHandHistory(handsData) {
    if (!handsData) {
        handsData = await apiCall('getHands', { session_id: currentSession.session_id });
    }
    if (handsData.error || handsData.length === 0) {
        document.getElementById('activeHandHistoryBottom').innerHTML = '';
        return;
    }
    const handsByNumber = {};
    for (let i = 0; i < handsData.length; i++) {
        const hand = handsData[i];
        if (!handsByNumber[hand.hand_number]) handsByNumber[hand.hand_number] = [];
        handsByNumber[hand.hand_number].push(hand);
    }
    const handNumbers = Object.keys(handsByNumber).sort((a, b) => b - a);
    let html = '';
    for (let i = 0; i < handNumbers.length; i++) {
        const handNum = handNumbers[i];
        const hands = handsByNumber[handNum];
        let scoreText = '', lockoutPlayer = '', isFalseLockout = false, handComment = '';
        for (let j = 0; j < hands.length; j++) {
            const h = hands[j];
            if (h.lockout_player_id && String(h.lockout_player_id) === String(h.player_id)) {
if (h.lockout_score !== null && h.lockout_score !== undefined && h.lockout_score !== '') {
    if (h.false_lockout == 1 || h.false_lockout === true) {
        scoreText += getPlayerName(h.player_id) + ': ' + h.score + ' (' + h.lockout_score + ' + ' + (h.score - h.lockout_score) + ' penalty) | ';
    } else {
        scoreText += getPlayerName(h.player_id) + ': ' + h.score + ' (' + h.lockout_score + ') | ';
    }
} else {
    scoreText += getPlayerName(h.player_id) + ': ' + h.score + ' | ';
}
                lockoutPlayer = getPlayerName(h.player_id);
                isFalseLockout = (h.false_lockout == 1 || h.false_lockout === true);
            } else {
                scoreText += getPlayerName(h.player_id) + ': ' + h.score + ' | ';
            }
            if (h.comment && !handComment) handComment = h.comment;
        }
        scoreText = scoreText.slice(0, -3);
        html += '<div class="hand-item"><div class="hand-item-info">';
        html += '<strong>Hand ' + handNum + '</strong><br>';
        html += '<small>' + scoreText + '</small><br>';
        html += '<small>Lockout: ' + lockoutPlayer + (isFalseLockout ? ' (FALSE)' : '') + '</small>';
        if (handComment) html += '<br><small class="comment-text">💬 ' + handComment + '</small>';
        html += '</div><div class="hand-item-actions">';
        html += '<button class="btn btn-warning btn-small" onclick="editHand(' + handNum + ', event)">Edit</button>';
        if (i === 0) html += '<button class="btn btn-danger btn-small" onclick="deleteHand(' + handNum + ', event)">Delete</button>';
        html += '</div></div>';
    }
    document.getElementById('activeHandHistoryBottom').innerHTML =
        '<div class="hand-history-scrollable">' +
            '<h4>Hand History</h4>' +
            '<div class="hand-history-scroll-inner">' + html + '</div>' +
        '</div>';
}

async function editHand(handNumber, event) {
    if (event && event.target) setButtonLoading(event.target, true);
    const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
    const handsToEdit = handsData.filter(h => h.hand_number == handNumber);
    if (handsToEdit.length === 0) { alert('Hand not found'); return; }
    currentEditingHand = handNumber;
    document.getElementById('editHandNumber').textContent = handNumber;
    document.getElementById('editLockoutWarning').style.display = 'none';
    let html = '', lockoutPlayerId = null, isFalseLockout = false, handComment = '';
    for (let i = 0; i < handsToEdit.length; i++) {
        const hand = handsToEdit[i];
        if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
            lockoutPlayerId = hand.player_id;
            isFalseLockout = (hand.false_lockout == 1 || hand.false_lockout === true);
        }
        if (hand.comment && !handComment) handComment = hand.comment;
    }
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        const joinHand = getPlayerJoinHand(player.player_id);
        if (joinHand <= handNumber) {
            const handData = handsToEdit.find(h => String(h.player_id) === String(player.player_id));
            let displayScore = '';
            if (handData) {
                displayScore = (lockoutPlayerId && String(lockoutPlayerId) === String(player.player_id))
                    ? (handData.lockout_score ? handData.lockout_score : handData.score)
                    : handData.score;
            }
            const isLockout = (lockoutPlayerId && String(lockoutPlayerId) === String(player.player_id));
            html += '<div class="player-hand-row">';
            html += '<label for="edit_score_' + player.player_id + '">' + player.username + '</label>';
            html += '<input type="number" id="edit_score_' + player.player_id + '" aria-label="Edit score for ' + escapeAttr(decodeHtml(player.username)) + '" value="' + displayScore + '" placeholder="Score" min="-2" oninput="checkEditLockoutValidity()">';
            html += '<label style="display: flex; align-items: center; gap: 5px; margin: 0;"><input type="radio" name="edit_lockout_player" aria-label="' + escapeAttr(decodeHtml(player.username)) + ' locked out" value="' + player.player_id + '" ' + (isLockout ? 'checked' : '') + ' onchange="checkEditLockoutValidity()"> Locked Out</label>';
            html += '</div>';
        }
    }
    document.getElementById('editHandInputs').innerHTML = html;
    document.getElementById('editHandComment').value = decodeHtml(handComment);
    document.getElementById('editHandModal').classList.add('active');
    setTimeout(checkEditLockoutValidity, 100);
    if (event && event.target) setButtonLoading(event.target, false);
}

function checkEditLockoutValidity() {
    const warningDiv = document.getElementById('editLockoutWarning');
    const lockoutRadio = document.querySelector('input[name="edit_lockout_player"]:checked');
    if (!lockoutRadio) { warningDiv.style.display = 'none'; return; }
    const lockoutPlayerId = lockoutRadio.value;
    const scores = [];
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        if (getPlayerJoinHand(player.player_id) <= currentEditingHand) {
            const scoreVal = document.getElementById('edit_score_' + player.player_id).value.trim();
            if (scoreVal === '') { warningDiv.style.display = 'none'; return; }
            scores.push({ player_id: player.player_id, score: parseFloat(scoreVal) });
        }
    }
    const { isFalseLockout, lockoutPlayerScore, lowestScore, playersWithLowest } = determineFalseLockout(scores, lockoutPlayerId);
    if (isFalseLockout) {
        warningDiv.innerHTML = buildLockoutWarningMessage(getPlayerName(lockoutPlayerId), lockoutPlayerScore, lowestScore, playersWithLowest, getPlayerName);
        warningDiv.style.display = 'block';
        hapticFeedback('error');
    } else {
        warningDiv.style.display = 'none';
    }
}

async function saveEditedHand(event) {
    const messageDiv = document.getElementById('editHandMessage');
    const saveBtn = event.target;
    setButtonLoading(saveBtn, true);
    const scores = [];
    const lockoutRadio = document.querySelector('input[name="edit_lockout_player"]:checked');
    if (!lockoutRadio) { messageDiv.innerHTML = '<div class="error">Please select who locked out</div>'; setButtonLoading(saveBtn, false); return; }
    const lockoutPlayerId = lockoutRadio.value;
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        const joinHand = getPlayerJoinHand(player.player_id);
        if (joinHand <= currentEditingHand) {
            const scoreInput = document.getElementById('edit_score_' + player.player_id);
            const scoreVal = scoreInput.value.trim();
            if (scoreVal === '') { messageDiv.innerHTML = '<div class="error">Please enter all scores</div>'; setButtonLoading(saveBtn, false); return; }
            const scoreNum = parseFloat(scoreVal);
            if (scoreNum < MIN_SCORE) { messageDiv.innerHTML = '<div class="error">Minimum score is -2 (two Red Kings)</div>'; hapticFeedback('error'); setButtonLoading(saveBtn, false); return; }
            scores.push({ player_id: player.player_id, score: scoreNum });
        }
    }
    const { isFalseLockout, lockoutPlayerScore } = determineFalseLockout(scores, lockoutPlayerId);
    let falseLockout = isFalseLockout;
    if (document.getElementById('editLockoutWarning').style.display === 'block') {
        if (!confirm('This will be marked as a FALSE LOCKOUT. Continue?')) { setButtonLoading(saveBtn, false); return; }
    }
    let penalty = 10;
    if (currentSession.false_lockout_penalty) penalty = Number(currentSession.false_lockout_penalty);
    const lockoutScoreValue = lockoutPlayerScore;
    for (let i = 0; i < scores.length; i++) {
        if (String(scores[i].player_id) === String(lockoutPlayerId)) {
            scores[i].score = falseLockout ? lockoutScoreValue + penalty : (lockoutScoreValue < 0 ? lockoutScoreValue : 0);
            break;
        }
    }
    const comment = document.getElementById('editHandComment').value.trim();
    let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
    const data = await apiCall('updateHand', {
        session_id: currentSession.session_id, hand_number: currentEditingHand,
        scores: JSON.stringify(scores), lockout_player_id: lockoutPlayerId,
        false_lockout: falseLockout, editor_name: hostPlayer ? hostPlayer.username : 'Unknown',
        comment: comment, lockout_score: lockoutScoreValue
    });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
        setButtonLoading(saveBtn, false);
    } else {
        messageDiv.innerHTML = '<div class="success">Hand updated!</div>';
        setTimeout(function() { closeEditModal(); updateSessionScores(); setButtonLoading(saveBtn, false); }, 1000);
    }
}

function closeEditModal() {
    document.getElementById('editHandModal').classList.remove('active');
    document.getElementById('editHandMessage').innerHTML = '';
    currentEditingHand = null;
}

async function deleteHand(handNumber, event) {
    if (!confirm('Delete Hand ' + handNumber + '? This cannot be undone.')) return;
    if (event && event.target) setButtonLoading(event.target, true);
    let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
    const data = await apiCall('deleteHand', {
        session_id: currentSession.session_id, hand_number: handNumber,
        editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
    });
    if (data.error) {
        alert('❌ Failed to delete hand. Please try again.\n\n' + data.error);
        hapticFeedback('error');
        if (event && event.target) setButtonLoading(event.target, false);
    } else {
        if (handNumber == currentHandNumber - 1) { currentHandNumber--; setupHandInputs(); }
        hapticFeedback('success');
        updateSessionScores();
        if (event && event.target) setButtonLoading(event.target, false);
    }
}

// ============================================
// ACTIVE SESSION SCORING & CHARTS
// ============================================
async function updateSessionScores() {
    document.getElementById('sessionScores').innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-15">Calculating scores...</h3>' +
            '<div class="overflow-x-auto">' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
            '</div>' +
        '</div>';
    document.getElementById('handHistorySection').style.display = 'none';
    document.getElementById('handHistoryList').innerHTML = '';
document.getElementById('activeHandHistoryBottom').innerHTML =
    '<div class="skeleton-card">' +
        '<h3 class="section-heading-blue mb-15">Loading hand history...</h3>' +
        '<div class="shimmer-wrapper skeleton-text skeleton-w-50 mb-10" style="height:18px;"></div>' +
        '<div class="shimmer-wrapper skeleton-text skeleton-w-100 mb-10" style="height:40px;"></div>' +
        '<div class="shimmer-wrapper skeleton-text skeleton-w-100 mb-10" style="height:40px;"></div>' +
    '</div>';

    const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
    if (handsData.error) return;

if (handsData.length === 0) {
    document.getElementById('sessionScores').innerHTML =
        '<div class="no-active-sessions-box">' +
            '<p>🎴 No hands played yet</p>' +
            '<p class="text-muted text-sm">Submit your first hand above to begin tracking!</p>' +
        '</div>';
    document.getElementById('activeSessionCharts').innerHTML = '';
    document.getElementById('activeHandHistoryBottom').innerHTML = '';
    return;
}

    const playerScores = {};
    let totalLockoutScore = 0, totalLockouts = 0, falseLockoutCount = 0;

    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        const startingScore = getPlayerStartingScore(player.player_id);
        playerScores[player.player_id] = {
            username: player.username, total: startingScore, hands: [],
            lockouts: 0, lockoutScores: [], falseLockouts: 0, falseLockoutScores: [],
            totalLockouts: 0, joinHand: getPlayerJoinHand(player.player_id), startingScore: startingScore
        };
    }

    for (let i = 0; i < handsData.length; i++) {
        const hand = handsData[i];
        if (playerScores[hand.player_id]) {
            playerScores[hand.player_id].total += Number(hand.score);
            playerScores[hand.player_id].hands.push({ hand_number: hand.hand_number, score: hand.score });
            if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
                playerScores[hand.player_id].totalLockouts++;
                const lockoutScoreToUse = (hand.lockout_score !== null && hand.lockout_score !== undefined && hand.lockout_score !== '') ? Number(hand.lockout_score) : Number(hand.score);
                playerScores[hand.player_id].lockoutScores.push(lockoutScoreToUse);
                totalLockoutScore += lockoutScoreToUse;
                totalLockouts++;
                if (hand.false_lockout == 1 || hand.false_lockout === true) {
                    falseLockoutCount++;
                    playerScores[hand.player_id].falseLockouts++;
                    playerScores[hand.player_id].falseLockoutScores.push(lockoutScoreToUse);
                } else {
                    playerScores[hand.player_id].lockouts++;
                }
            }
        }
    }

    const scores = Object.values(playerScores).sort((a, b) => a.total - b.total);
    const leader = scores[0];
    const biggestGap = scores[scores.length - 1].total - leader.total;
    let mostLockoutsPlayer = { username: 'None', lockouts: 0 };
    for (let i = 0; i < scores.length; i++) {
        if (scores[i].lockouts > mostLockoutsPlayer.lockouts) mostLockoutsPlayer = { username: scores[i].username, lockouts: scores[i].lockouts };
    }
    const avgScorePerHand = handsData.reduce((sum, h) => sum + Number(h.score), 0) / handsData.length;
    const overallAvgLockout = totalLockouts > 0 ? (totalLockoutScore / totalLockouts).toFixed(2) : 'N/A';

    let html = '<h3>Scores</h3>';
    html += '<p class="text-muted text-sm mb-10">💡 Click column headers to sort</p>';
    html += '<div class="overflow-x-auto"><table class="scores-table" id="activeSessionTable"><tr>';
    html += '<th onclick="sortActiveSessionTable(0)" style="cursor: pointer; user-select: none;">Player ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(1)" style="cursor: pointer; user-select: none;">Total ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(2)" style="cursor: pointer; user-select: none;">Hands ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(3)" style="cursor: pointer; user-select: none;">Avg Hand ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(4)" style="cursor: pointer; user-select: none;">Lockouts ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(5)" style="cursor: pointer; user-select: none;">LO Rate ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(6)" style="cursor: pointer; user-select: none;">Avg LO Score (All) ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(7)" style="cursor: pointer; user-select: none;">False LO ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(8)" style="cursor: pointer; user-select: none;">False LO Rate ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(9)" style="cursor: pointer; user-select: none;">Avg False LO Score ⇅</th>';
    html += '</tr>';

    for (let i = 0; i < scores.length; i++) {
        const p = scores[i];
        const handsPlayed = p.hands.length;
        const avgHand = calculateAverageHand(p.hands);
        const lockoutRate = handsPlayed > 0 ? ((p.lockouts / handsPlayed) * 100).toFixed(1) : '0';
        const avgLockoutScore = p.lockoutScores.length > 0 ? (p.lockoutScores.reduce((sum, s) => sum + s, 0) / p.lockoutScores.length).toFixed(2) : 'N/A';
        const falseLockoutRate = p.totalLockouts > 0 ? ((p.falseLockouts / p.totalLockouts) * 100).toFixed(1) : '0';
        const avgFalseLockoutScore = p.falseLockoutScores.length > 0 ? (p.falseLockoutScores.reduce((sum, s) => sum + s, 0) / p.falseLockoutScores.length).toFixed(2) : 'N/A';
        html += '<tr>';
        const _pid = sessionPlayers.find(sp => sp.username === p.username).player_id;
        html += '<td><strong><span class="player-link" onclick="showPlayerProfile(' + _pid + ')">' + p.username + '</span></strong>' + (p.joinHand > 1 ? ' <span class="late-join-badge">H' + p.joinHand + '</span>' : '') + ' ' + formatEloBadge(_pid) + '</td>';
        html += '<td>' + p.total + '</td><td>' + handsPlayed + '</td><td>' + avgHand + '</td>';
        html += '<td>' + p.lockouts + '</td><td>' + lockoutRate + '%</td><td>' + avgLockoutScore + '</td>';
        html += '<td>' + p.falseLockouts + '</td><td>' + falseLockoutRate + '%</td><td>' + avgFalseLockoutScore + '</td>';
        html += '</tr>';
    }
    html += '</table></div>';

    html += '<div class="stats-summary-box">';
    html += '<h3 class="heading-dark-green">📊 Session Statistics</h3>';
    html += '<div class="stats-summary-grid">';
    html += '<div><strong>🎴 Total Hands:</strong> ' + (new Set(handsData.map(h => h.hand_number)).size) + '</div>';
    html += '<div><strong>📈 Avg Score/Hand:</strong> ' + avgScorePerHand.toFixed(2) + '</div>';
    html += '<div><strong>🏆 Current Leader:</strong> ' + leader.username + ' (' + leader.total + ' pts)</div>';
    html += '<div><strong>📏 Biggest Gap:</strong> ' + biggestGap + ' points</div>';
    html += '<div><strong>🎯 Most Lockouts:</strong> ' + mostLockoutsPlayer.username + ' (' + mostLockoutsPlayer.lockouts + ')</div>';
    html += '<div><strong>⚠️ False Lockouts:</strong> ' + falseLockoutCount + '</div>';
    html += '</div>';
    html += '<div class="lockout-perf-box">';
    html += '<strong class="term-heading-blue">Lockout Performance:</strong><br>';
    html += '<div class="mt-10">• <strong>Overall Avg:</strong> ' + overallAvgLockout + '</div>';
    for (let i = 0; i < scores.length; i++) {
        const p = scores[i];
        if (p.lockouts > 0) {
            const avgLockout = (p.lockoutScores.reduce((sum, s) => sum + s, 0) / p.lockouts).toFixed(2);
            const isBest = (totalLockouts > 0 && avgLockout === Math.min(...scores.filter(s => s.lockouts > 0).map(s => (s.lockoutScores.reduce((sum, sc) => sum + sc, 0) / s.lockouts).toFixed(2))));
            html += '<div>• <strong>' + p.username + ':</strong> ' + avgLockout + ' (' + p.lockouts + ' lockouts)' + (isBest ? ' ⭐ Best!' : '') + '</div>';
        } else {
            html += '<div>• <strong>' + p.username + ':</strong> No lockouts yet</div>';
        }
    }
    html += '</div></div>';
    document.getElementById('sessionScores').innerHTML = html;

    const chartSection = document.getElementById('activeSessionCharts');
    if (chartSection && handsData.length > 0) {
        let chartsHtml = '<h3 class="mt-20">Session Graphs</h3>';
        chartsHtml += '<div class="chart-container"><canvas id="activeWormChart"></canvas></div>';
        chartsHtml += '<div class="chart-container"><canvas id="activeManhattanChart"></canvas></div>';
        chartSection.innerHTML = chartsHtml;
        const playerHandsData = {}, playerIdsArray = [];
        for (let i = 0; i < scores.length; i++) {
            const p = scores[i];
            const playerId = sessionPlayers.find(sp => sp.username === p.username).player_id;
            playerIdsArray.push(playerId);
            playerHandsData[playerId] = p.hands.map(h => h.score);
        }
        setTimeout(function() { drawActiveWormChart(playerHandsData, playerIdsArray); drawActiveManhattanChart(playerHandsData, playerIdsArray); }, 100);
    }

    await displayHandHistory(handsData);
}

// ============================================
// ACTIVE SESSION CHARTS
// ============================================
function drawActiveWormChart(playerHands, playerIds) {
    const ctx = document.getElementById('activeWormChart');
    if (!ctx) return;
    const datasets = [], colors = ['#667eea', '#f5576c', '#4facfe', '#00f2fe', '#fa709a'];
    const maxHands = Math.max.apply(null, Object.keys(playerHands).map(k => playerHands[k].length));
    for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i], hands = playerHands[playerId];
        const joinHand = getPlayerJoinHand(playerId), startingScore = getPlayerStartingScore(playerId);
        let cumulative = startingScore;
        const cumulativeScores = [];
        for (let h = 1; h < joinHand; h++) cumulativeScores.push(null);
        for (let j = 0; j < hands.length; j++) { cumulative += hands[j]; cumulativeScores.push(cumulative); }
        datasets.push({ label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''), data: cumulativeScores, borderColor: colors[i % colors.length], backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, spanGaps: false });
    }
    const labels = [];
    for (let i = 1; i <= maxHands; i++) labels.push('Hand ' + i);
    if (window._activeWormChart) window._activeWormChart.destroy();
    window._activeWormChart = new Chart(ctx.getContext('2d'), { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cricket Worm' }, legend: { display: true, position: 'top' } }, scales: { y: { title: { display: true, text: 'Cumulative Score' } } } } });
}

function drawActiveManhattanChart(playerHands, playerIds) {
    const ctx = document.getElementById('activeManhattanChart');
    if (!ctx) return;
    const colors = CHART_COLORS;
    const maxHands = Math.max.apply(null, Object.keys(playerHands).map(k => playerHands[k].length));
    const labels = [];
    for (let i = 1; i <= maxHands; i++) labels.push('Hand ' + i);
    const datasets = [];
    for (let i = 0; i < playerIds.length; i++) {
        const playerId = playerIds[i], hands = playerHands[playerId], joinHand = getPlayerJoinHand(playerId);
        const dataArray = [];
        for (let h = 1; h < joinHand; h++) dataArray.push(null);
        for (let j = 0; j < hands.length; j++) dataArray.push(hands[j]);
        datasets.push({ label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''), data: dataArray, backgroundColor: colors[i % colors.length], borderColor: colors[i % colors.length], borderWidth: 1 });
    }
    if (window._activeManhattanChart) window._activeManhattanChart.destroy();
    window._activeManhattanChart = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Manhattan' }, legend: { display: true, position: 'top' } }, scales: { x: { title: { display: true, text: 'Hand Number' } }, y: { title: { display: true, text: 'Score' }, beginAtZero: true } } } });
}

// ============================================
// PREVIOUS SESSIONS & SESSION DETAIL
// ============================================
async function loadPreviousSessions(requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : getNavigationIntent();
    const contentDiv = document.getElementById('previousSessionsContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-15">Loading previous sessions...</h3>' +
            '<div class="skeleton-session-item"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text small skeleton-w-50"></div></div>' +
            '<div class="skeleton-session-item"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text small skeleton-w-50"></div></div>' +
            '<div class="skeleton-session-item"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text small skeleton-w-50"></div></div>' +
        '</div>';

    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return false;
    const sessionsWithHands = await apiCall('getSessionsWithHands', {});
    if (!isCurrentNavigationIntent(intentId)) return false;
    if (sessionsWithHands.error) { contentDiv.innerHTML = '<div class="error">Error loading sessions: ' + sessionsWithHands.error + '</div>'; return; }

    const completedSessions = [];
    for (let i = 0; i < sessionsWithHands.length; i++) {
        const item = sessionsWithHands[i];
        if (!item.session.notes) item.session.notes = '';
        if (!item.session.tags) item.session.tags = '';
        if (!item.session.player_join_info) item.session.player_join_info = '{}';
        if (item.session.date_ended && item.session.date_ended !== '') completedSessions.push({ session: item.session, hands: item.hands, index: i });
    }
    completedSessions.sort(function(a, b) { return lockoutDateValue(b.session.date_started) - lockoutDateValue(a.session.date_started); });

    allSessions = completedSessions.map(item => item.session);
    window.sessionsHandsCache = {};
    for (let i = 0; i < completedSessions.length; i++) window.sessionsHandsCache[completedSessions[i].session.session_id] = completedSessions[i].hands;

    if (completedSessions.length === 0) { contentDiv.innerHTML = '<div class="placeholder-content"><h3>No Completed Sessions</h3><p>Complete a session to see it here!</p></div>'; return; }

    const eloHistoryAll = await apiCall('getEloHistoryAll', {});
    if (!isCurrentNavigationIntent(intentId)) return false;
    const eloHistoryMap = {};
    if (!eloHistoryAll.error) {
        for (let i = 0; i < eloHistoryAll.length; i++) {
            const entry = eloHistoryAll[i];
            const key = String(entry.session_id) + '_' + String(entry.player_id);
            eloHistoryMap[key] = entry;
        }
    }

    let html = '<div class="mb-20"><input type="text" id="sessionSearchInput" placeholder="🔍 Search sessions by title, player, or tag..." style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1em;" oninput="filterSessions()"></div>';
    html += '<div id="sessionListContainer" style="max-height: 600px; overflow-y: auto; padding-right: 5px;"><ul class="session-list" id="sessionList">';

    for (let i = 0; i < completedSessions.length; i++) {
const session = completedSessions[i].session;
if (session.title && session.title.charAt(0) === "'") {
    session.title = session.title.substring(1);
}
const hands = completedSessions[i].hands;
        var cleanDate = formatUKDate(session.date_started);
        var playerIds = session.players_involved.split(',');
        var playerTotals = {}, handCount = 0, joinInfo = {};
        try {
            if (session.player_join_info && session.player_join_info !== '' && session.player_join_info !== '{}') {
                var parsed = JSON.parse(session.player_join_info);
                for (var pid in parsed) { if (parsed[pid] && parsed[pid].starting_score !== undefined) joinInfo[pid] = parsed[pid].starting_score; }
            }
        } catch(e) {}
        for (var p = 0; p < playerIds.length; p++) { var pid = String(playerIds[p].trim()); playerTotals[pid] = joinInfo[pid] || 0; }
        var handNumbers = new Set();
        for (var h = 0; h < hands.length; h++) {
            var hand = hands[h];
            handNumbers.add(hand.hand_number);
            if (playerTotals[hand.player_id] !== undefined) playerTotals[hand.player_id] += Number(hand.score);
        }
        handCount = handNumbers.size;
        var lowestScore = Infinity, winnerId = null;
        for (var pid in playerTotals) { if (playerTotals[pid] < lowestScore) { lowestScore = playerTotals[pid]; winnerId = pid; } }
        var winnerName = winnerId
            ? '<span class="player-link" onclick="event.stopPropagation(); showPlayerProfile(' + winnerId + ')">' + getPlayerName(winnerId) + '</span>'
            : 'Unknown';

html += '<li class="session-item" onclick="viewSessionDetail(' + i + ', this)">';
html += '<div class="session-item-header" style="display:flex; justify-content:space-between; align-items:center;">';
html += '<span>' + escapeAttr(session.title) + '</span>';
        if (session.photo_url && session.photo_url !== '') {
            html += '<img src="' + session.photo_url + '" style="width:48px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation(); openPhotoFullscreen(\'' + session.photo_url + '\')">';
        }
        html += '</div>';
        html += '<div class="session-item-info" style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">';
        html += '<div>📅 ' + cleanDate + ' • ' + handCount + ' hands • ' + playerIds.length + ' players</div>';
        let winnerLine = '🏆 ' + winnerName;
        if (winnerId) {
            const eloEntry = eloHistoryMap[String(session.session_id) + '_' + String(winnerId)];
            if (eloEntry) {
                const newRating = Math.round(Number(eloEntry.new_rating));
                const change = Math.round(Number(eloEntry.change));
                const changeStr = change >= 0 ? '+' + change : String(change);
                const changeColor = change > 0 ? '#4caf50' : change < 0 ? '#f5576c' : '#666';
                winnerLine += ' <span class="elo-badge" style="background:#1a1a2e; color:#ffd700; font-size:0.75em;">⚡ ' + newRating + '</span>' +
                              ' <span style="color:' + changeColor + '; font-weight:600; font-size:0.8em;">(' + changeStr + ')</span>' +
                              ' <span style="color:#888; font-size:0.85em;">• ' + lowestScore + ' pts</span>';
            } else {
                winnerLine += ' <span style="color:#888; font-size:0.85em;">• ' + lowestScore + ' pts</span>';
            }
        } else {
            winnerLine += ' <span style="color:#888; font-size:0.85em;">• ' + lowestScore + ' pts</span>';
        }
        html += '<div style="color: #4caf50; font-weight: 600;">' + winnerLine + '</div>';

        if (session.tags && session.tags !== '') {
            var tagsArray = session.tags.split(',').filter(function(t) { return t.trim(); });
            if (tagsArray.length > 0) {
                html += '<div style="margin-top: 4px;">';
                for (var t = 0; t < tagsArray.length; t++) html += '<span class="tag-badge" style="font-size: 0.75em; padding: 2px 8px;">' + tagsArray[t] + '</span>';
                html += '</div>';
            }
        }
        html += '</div></li>';
    }
    html += '</ul></div>';
    contentDiv.innerHTML = html;
    return true;
}

async function viewSessionDetail(sessionIndex, buttonElement, requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    if (buttonElement) setButtonLoading(buttonElement, true);
    const session = allSessions[sessionIndex];
    if (!session) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    document.getElementById('sessionDetailContent').innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-15">Loading session details...</h3>' +
            '<div class="overflow-x-auto">' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
            '</div>' +
        '</div>';

    let handsData = await apiCall('getHands', { session_id: session.session_id });
    if (!isCurrentNavigationIntent(intentId)) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    if (handsData.error) { alert('Error loading session details'); if (buttonElement) setButtonLoading(buttonElement, false); return; }
    for (let i = 0; i < handsData.length; i++) { if (!handsData[i].comment) handsData[i].comment = ''; }

    document.getElementById('sessionDetailTitle').textContent = session.title;
    const joinInfo = parsePlayerJoinInfo(session.player_join_info);

    let metadataHtml = '';
    if ((session.notes && session.notes !== '') || (session.tags && session.tags !== '') || (Object.keys(joinInfo).length > 0)) {
        metadataHtml += '<div class="session-metadata">';
        if (session.notes && session.notes !== '') metadataHtml += '<p><strong>📝 Notes:</strong> ' + session.notes + '</p>';
        if (session.tags && session.tags !== '') {
            const tagsArray = session.tags.split(',').filter(t => t.trim());
            if (tagsArray.length > 0) {
                metadataHtml += '<p><strong>🏷️ Tags:</strong> ';
                for (let i = 0; i < tagsArray.length; i++) metadataHtml += '<span class="tag-badge">' + tagsArray[i] + '</span>';
                metadataHtml += '</p>';
            }
        }
        if (Object.keys(joinInfo).length > 0) {
            metadataHtml += '<p><strong>👥 Late Joiners:</strong> ';
            const joiners = [];
            for (let playerId in joinInfo) joiners.push(getPlayerName(playerId) + ' (Hand ' + joinInfo[playerId] + ')');
            metadataHtml += joiners.join(', ') + '</p>';
        }
        metadataHtml += '</div>';
    }
    if (session.photo_url && session.photo_url !== '') {
        metadataHtml += '<div class="session-photo-container"><img src="' + session.photo_url + '" class="session-photo-full" onclick="openPhotoFullscreen(\'' + session.photo_url + '\')"></div>';
    }
    document.getElementById('sessionDetailMetadata').innerHTML = metadataHtml;

    const playerTotals = {}, playerHandScores = {}, playerStats = {}, playerJoinHands = {};
    for (let playerId in joinInfo) playerJoinHands[playerId] = joinInfo[playerId];
    const allPlayerIds = new Set();
    for (let i = 0; i < handsData.length; i++) allPlayerIds.add(String(handsData[i].player_id));
    for (let pid of allPlayerIds) {
        let startingScore = 0;
        if (session.player_join_info) {
            try { const fullInfo = JSON.parse(session.player_join_info); if (fullInfo[pid] && fullInfo[pid].starting_score !== undefined) startingScore = fullInfo[pid].starting_score; } catch(e) {}
        }
        playerTotals[pid] = startingScore;
        playerHandScores[pid] = [];
        playerStats[pid] = { lockouts: 0, lockoutScores: [], falseLockouts: 0, falseLockoutScores: [], totalLockouts: 0 };
    }
    for (let i = 0; i < handsData.length; i++) {
        const hand = handsData[i], pid = String(hand.player_id);
        playerTotals[pid] += Number(hand.score);
        playerHandScores[pid].push({ handNum: Number(hand.hand_number), score: Number(hand.score) });
        if (hand.lockout_player_id && String(hand.lockout_player_id) === String(pid)) {
            playerStats[pid].totalLockouts++;
            const lockoutScoreToUse = (hand.lockout_score !== null && hand.lockout_score !== undefined && hand.lockout_score !== '') ? Number(hand.lockout_score) : Number(hand.score);
            playerStats[pid].lockoutScores.push(lockoutScoreToUse);
            if (hand.false_lockout == 1 || hand.false_lockout === true) { playerStats[pid].falseLockouts++; playerStats[pid].falseLockoutScores.push(lockoutScoreToUse); }
            else { playerStats[pid].lockouts++; }
        }
    }

const sortedPlayers = Object.keys(playerTotals).sort(function(a, b) { return playerTotals[a] - playerTotals[b]; });

    const sessionElo = {};
    const eloHistoryAll = await apiCall('getEloHistoryAll', {});
    if (!isCurrentNavigationIntent(intentId)) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    if (!eloHistoryAll.error) {
        for (let i = 0; i < eloHistoryAll.length; i++) {
            const entry = eloHistoryAll[i];
            if (String(entry.session_id) === String(session.session_id)) {
                sessionElo[String(entry.player_id)] = {
                    new_rating: Math.round(Number(entry.new_rating)),
                    change: Math.round(Number(entry.change))
                };
            }
        }
    }
    const hasElo = Object.keys(sessionElo).length > 0;

    let html = '<h3>Final Scores</h3>';
    html += '<p class="text-muted text-sm mb-10">💡 Click column headers to sort</p>';
    html += '<div class="overflow-x-auto"><table class="scores-table" id="sessionDetailTable"><tr>';
    html += '<th onclick="sortSessionTable(0)" style="cursor: pointer; user-select: none;">Player ⇅</th>';
    html += '<th onclick="sortSessionTable(1)" style="cursor: pointer; user-select: none;">Total ⇅</th>';
    html += '<th onclick="sortSessionTable(2)" style="cursor: pointer; user-select: none;">Hands ⇅</th>';
    html += '<th onclick="sortSessionTable(3)" style="cursor: pointer; user-select: none;">Avg Hand ⇅</th>';
    html += '<th onclick="sortSessionTable(4)" style="cursor: pointer; user-select: none;">Lockouts ⇅</th>';
    html += '<th onclick="sortSessionTable(5)" style="cursor: pointer; user-select: none;">LO Rate ⇅</th>';
    html += '<th onclick="sortSessionTable(6)" style="cursor: pointer; user-select: none;">Avg LO Score ⇅</th>';
    html += '<th onclick="sortSessionTable(7)" style="cursor: pointer; user-select: none;">False LO ⇅</th>';
    html += '<th onclick="sortSessionTable(8)" style="cursor: pointer; user-select: none;">False LO Rate ⇅</th>';
    html += '<th onclick="sortSessionTable(9)" style="cursor: pointer; user-select: none;">Avg False LO Score ⇅</th>';
    html += '</tr>';

    for (let i = 0; i < sortedPlayers.length; i++) {
        const playerId = sortedPlayers[i], total = playerTotals[playerId];
        const handsPlayed = playerHandScores[playerId].length;
        const avgHand = calculateAverageHand(playerHandScores[playerId]);
        const stats = playerStats[playerId];
        const lockoutRate = handsPlayed > 0 ? ((stats.lockouts / handsPlayed) * 100).toFixed(1) : '0';
        const avgLockoutScore = stats.lockoutScores.length > 0 ? (stats.lockoutScores.reduce((sum, s) => sum + s, 0) / stats.lockoutScores.length).toFixed(2) : 'N/A';
        const falseLockoutRate = stats.totalLockouts > 0 ? ((stats.falseLockouts / stats.totalLockouts) * 100).toFixed(1) : '0';
        const avgFalseLockoutScore = stats.falseLockoutScores.length > 0 ? (stats.falseLockoutScores.reduce((sum, s) => sum + s, 0) / stats.falseLockoutScores.length).toFixed(2) : 'N/A';
        let eloBadge = '';
        if (hasElo && sessionElo[playerId]) {
            const change = sessionElo[playerId].change;
            const changeStr = change >= 0 ? '+' + change : String(change);
            const changeColor = change > 0 ? '#4caf50' : change < 0 ? '#f5576c' : '#666';
            eloBadge = ' <span class="elo-badge" style="background:#1a1a2e; color:#ffd700; font-size:0.75em;">⚡ ' + sessionElo[playerId].new_rating + '</span>' +
                       '<span style="color:' + changeColor + '; font-weight:600; font-size:0.8em;"> (' + changeStr + ')</span>';
        }
        html += '<tr><td><strong>' + getPlayerName(playerId) + '</strong>' + eloBadge + '</td><td>' + total + '</td><td>' + handsPlayed + '</td><td>' + avgHand + '</td><td>' + stats.lockouts + '</td><td>' + lockoutRate + '%</td><td>' + avgLockoutScore + '</td><td>' + stats.falseLockouts + '</td><td>' + falseLockoutRate + '%</td><td>' + avgFalseLockoutScore + '</td></tr>';
}
html += '</table></div>';
document.getElementById('sessionDetailContent').innerHTML = html;

const handsByNumber = {};
for (let i = 0; i < handsData.length; i++) {
    const hand = handsData[i];
    if (!handsByNumber[hand.hand_number]) handsByNumber[hand.hand_number] = [];
    handsByNumber[hand.hand_number].push(hand);
}
const handNumbers = Object.keys(handsByNumber).sort((a, b) => Number(a) - Number(b));

let handHistoryHtml = '<div class="hand-history-scrollable"><h4>Hand-by-Hand Breakdown</h4><div class="hand-history-scroll-inner">';
for (let i = 0; i < handNumbers.length; i++) {
    const handNum = handNumbers[i], hands = handsByNumber[handNum];
    let scoreText = '', lockoutPlayer = '', isFalseLockout = false, handComment = '';
    for (let j = 0; j < hands.length; j++) {
        const h = hands[j];
        if (h.lockout_player_id && String(h.lockout_player_id) === String(h.player_id)) {
if (h.lockout_score !== null && h.lockout_score !== undefined && h.lockout_score !== '') {
    scoreText += getPlayerName(h.player_id) + ': ' + h.score + (h.false_lockout == 1 || h.false_lockout === true ? ' (' + h.lockout_score + ' + ' + (h.score - h.lockout_score) + ' penalty)' : ' (' + h.lockout_score + ')') + ' | ';
} else { scoreText += getPlayerName(h.player_id) + ': ' + h.score + ' | '; }
            lockoutPlayer = getPlayerName(h.player_id);
            isFalseLockout = (h.false_lockout == 1 || h.false_lockout === true);
        } else { scoreText += getPlayerName(h.player_id) + ': ' + h.score + ' | '; }
        if (h.comment && !handComment) handComment = h.comment;
    }
    scoreText = scoreText.slice(0, -3);
    handHistoryHtml += '<div class="hand-item"><div class="hand-item-info">';
    handHistoryHtml += '<strong>Hand ' + handNum + '</strong><br><small>' + scoreText + '</small><br>';
    handHistoryHtml += '<small>Lockout: ' + lockoutPlayer + (isFalseLockout ? ' (FALSE)' : '') + '</small>';
    if (handComment) handHistoryHtml += '<br><small class="comment-text">💬 ' + handComment + '</small>';
    handHistoryHtml += '</div></div>';
}
handHistoryHtml += '</div></div>';
document.getElementById('sessionDetailHandHistory').innerHTML = handHistoryHtml;

    let graphsHtml = '<h3 class="mt-20">Graphs</h3>';
    graphsHtml += '<div class="chart-container"><canvas id="wormChart"></canvas></div>';
    graphsHtml += '<div class="chart-container"><canvas id="manhattanChart"></canvas></div>';
    document.getElementById('sessionDetailGraphs').innerHTML = graphsHtml;
    showScreen('sessionDetailScreen', false, intentId);
    setTimeout(function() {
        if (!isCurrentNavigationIntent(intentId)) return;
        drawSessionWormChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session);
        drawSessionManhattanChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session);
    }, 100);
}

// ============================================
// COMPLETED SESSION CHARTS
// ============================================
function drawSessionWormChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session) {
    const ctx = document.getElementById('wormChart');
    if (!ctx) return;
    const datasets = [], colors = ['#667eea', '#f5576c', '#4facfe', '#00f2fe', '#fa709a'];
    let maxHand = 0;
    for (let playerId in playerHandScores) for (let i = 0; i < playerHandScores[playerId].length; i++) if (playerHandScores[playerId][i].handNum > maxHand) maxHand = playerHandScores[playerId][i].handNum;
    for (let i = 0; i < sortedPlayers.length; i++) {
        const playerId = sortedPlayers[i], hands = playerHandScores[playerId], joinHand = playerJoinHands[playerId] || 1;
        let startingScore = 0;
        if (joinHand > 1 && session && session.player_join_info) {
            try { const fullInfo = JSON.parse(session.player_join_info); const info = fullInfo[playerId]; if (info && typeof info === 'object' && info.starting_score !== undefined) startingScore = info.starting_score; } catch(e) {}
        }
        let cumulative = startingScore;
        const dataPoints = [];
        for (let h = 1; h < joinHand; h++) dataPoints.push(null);
        for (let j = 0; j < hands.length; j++) { cumulative += hands[j].score; dataPoints.push(cumulative); }
        datasets.push({ label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''), data: dataPoints, borderColor: colors[i % colors.length], backgroundColor: 'transparent', borderWidth: 2, tension: 0.1, spanGaps: false });
    }
    const labels = [];
    for (let i = 1; i <= maxHand; i++) labels.push('Hand ' + i);
    if (window._sessionWormChart) window._sessionWormChart.destroy();
    window._sessionWormChart = new Chart(ctx.getContext('2d'), { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cricket Worm' }, legend: { display: true, position: 'top' } }, scales: { y: { title: { display: true, text: 'Cumulative Score' } } } } });
}

function drawSessionManhattanChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session) {
    const ctx = document.getElementById('manhattanChart');
    if (!ctx) return;
    const colors = CHART_COLORS;
    let maxHand = 0;
    for (let playerId in playerHandScores) for (let i = 0; i < playerHandScores[playerId].length; i++) if (playerHandScores[playerId][i].handNum > maxHand) maxHand = playerHandScores[playerId][i].handNum;
    const labels = [];
    for (let i = 1; i <= maxHand; i++) labels.push('Hand ' + i);
    const datasets = [];
    for (let i = 0; i < sortedPlayers.length; i++) {
        const playerId = sortedPlayers[i], hands = playerHandScores[playerId], joinHand = playerJoinHands[playerId] || 1;
        const dataArray = [];
        for (let h = 1; h < joinHand; h++) dataArray.push(null);
        for (let j = 0; j < hands.length; j++) dataArray.push(hands[j].score);
        datasets.push({ label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''), data: dataArray, backgroundColor: colors[i % colors.length], borderColor: colors[i % colors.length], borderWidth: 1 });
    }
    if (window._sessionManhattanChart) window._sessionManhattanChart.destroy();
    window._sessionManhattanChart = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Manhattan' }, legend: { display: true, position: 'top' } }, scales: { x: { title: { display: true, text: 'Hand Number' } }, y: { title: { display: true, text: 'Score' }, beginAtZero: true } } } });
}

// ============================================
// OVERALL STATS
// ============================================
async function loadStats(requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : getNavigationIntent();
    const contentDiv = document.getElementById('statsContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-20">Loading statistics...</h3>' +
            '<div class="stats-grid">' +
                '<div class="skeleton-stat-card"><div class="shimmer-wrapper skeleton-text small skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-stat-value"></div></div>' +
                '<div class="skeleton-stat-card"><div class="shimmer-wrapper skeleton-text small skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-stat-value"></div></div>' +
                '<div class="skeleton-stat-card"><div class="shimmer-wrapper skeleton-text small skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-stat-value"></div></div>' +
                '<div class="skeleton-stat-card"><div class="shimmer-wrapper skeleton-text small skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-stat-value"></div></div>' +
                '<div class="skeleton-stat-card"><div class="shimmer-wrapper skeleton-text small skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-stat-value"></div></div>' +
                '<div class="skeleton-stat-card"><div class="shimmer-wrapper skeleton-text small skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-stat-value"></div></div>' +
            '</div>' +
        '</div>';

    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return false;
    const sessionsWithHands = await apiCall('getSessionsWithHands', {});
    if (!isCurrentNavigationIntent(intentId)) return false;
    if (sessionsWithHands.error) { contentDiv.innerHTML = '<div class="error">Error loading stats</div>'; return; }

    const completedSessionsData = [], allSessionsData = [];
    for (let i = 0; i < sessionsWithHands.length; i++) {
        const item = sessionsWithHands[i];
        const isCompleted = (item.session.date_ended && item.session.date_ended !== '');
        const sessionData = { session_id: item.session.session_id, title: item.session.title, hands: item.hands, is_completed: isCompleted, player_join_info: item.session.player_join_info || '{}' };
        allSessionsData.push(sessionData);
        if (isCompleted) completedSessionsData.push(sessionData);
    }
    const stats = calculateOverallStats(completedSessionsData, allSessionsData, allPlayers);
    if (!isCurrentNavigationIntent(intentId)) return false;
    displayOverallStats(stats, completedSessionsData.length);
    return true;
}

function calculateOverallStats(completedSessionsData, allSessionsData, playersData) {
    const playerStats = {};
    for (let i = 0; i < playersData.length; i++) {
        const player = playersData[i];
        playerStats[player.player_id] = { username: player.username, sessionsWon: 0, sessionsPlayed: 0, handsWon: 0, handsPlayed: 0, totalScore: 0, lockoutScores: [], falseLockouts: 0, falseLockoutScores: [], totalLockouts: 0, currentHandStreak: 0, maxHandStreak: 0, bestMargin: 0, worstMargin: 0 };
    }
    let totalUniqueHands = 0;
    for (let s = 0; s < allSessionsData.length; s++) {
        const session = allSessionsData[s];
        const playerUniqueHands = {};
        for (let i = 0; i < playersData.length; i++) playerUniqueHands[playersData[i].player_id] = new Set();
        const sessionHandNumbers = new Set();
        for (let h = 0; h < session.hands.length; h++) {
            const hand = session.hands[h];
            if (playerStats[hand.player_id]) {
                playerStats[hand.player_id].totalScore += Number(hand.score);
                playerUniqueHands[hand.player_id].add(Number(hand.hand_number));
                sessionHandNumbers.add(Number(hand.hand_number));
                if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
                    playerStats[hand.player_id].totalLockouts++;
                    const lockoutScoreToUse = (hand.lockout_score !== null && hand.lockout_score !== undefined && hand.lockout_score !== '') ? Number(hand.lockout_score) : Number(hand.score);
                    playerStats[hand.player_id].lockoutScores.push(lockoutScoreToUse);
                    if (hand.false_lockout == 1 || hand.false_lockout === true) {
                        playerStats[hand.player_id].falseLockouts++;
                        playerStats[hand.player_id].falseLockoutScores.push(lockoutScoreToUse);
                        playerStats[hand.player_id].currentHandStreak = 0;
                    } else {
                        playerStats[hand.player_id].handsWon++;
                        playerStats[hand.player_id].currentHandStreak++;
                        if (playerStats[hand.player_id].currentHandStreak > playerStats[hand.player_id].maxHandStreak) playerStats[hand.player_id].maxHandStreak = playerStats[hand.player_id].currentHandStreak;
                    }
                } else { playerStats[hand.player_id].currentHandStreak = 0; }
            }
        }
        for (let playerId in playerUniqueHands) { const uniqueHandCount = playerUniqueHands[playerId].size; if (uniqueHandCount > 0) playerStats[playerId].handsPlayed += uniqueHandCount; }
        totalUniqueHands += sessionHandNumbers.size;
    }
    for (let s = 0; s < completedSessionsData.length; s++) {
        const session = completedSessionsData[s];
        const playerTotals = {}, playersInSession = new Set();
        try { const ji = JSON.parse(session.player_join_info || '{}'); for (let pid in ji) { if (ji[pid] && ji[pid].starting_score !== undefined) playerTotals[pid] = Number(ji[pid].starting_score); } } catch(e) {}
        for (let h = 0; h < session.hands.length; h++) {
            const hand = session.hands[h];
            if (playerTotals[hand.player_id] === undefined) playerTotals[hand.player_id] = 0;
            playerTotals[hand.player_id] += Number(hand.score);
            playersInSession.add(hand.player_id);
        }
        playersInSession.forEach(playerId => { if (playerStats[playerId]) playerStats[playerId].sessionsPlayed++; });
        let lowestScore = Infinity, winnerPlayerIds = [];
        for (let playerId in playerTotals) {
            const score = playerTotals[playerId];
            if (score < lowestScore) { lowestScore = score; winnerPlayerIds = [playerId]; }
            else if (score === lowestScore) winnerPlayerIds.push(playerId);
        }
        let secondLowestScore = Infinity;
        for (let playerId in playerTotals) { const score = playerTotals[playerId]; if (score > lowestScore && score < secondLowestScore) secondLowestScore = score; }
        for (let playerId in playerTotals) {
            if (playerStats[playerId]) {
                if (winnerPlayerIds.indexOf(String(playerId)) !== -1) {
                    playerStats[playerId].sessionsWon += (1 / winnerPlayerIds.length);
                    if (secondLowestScore !== Infinity) { const margin = secondLowestScore - lowestScore; if (margin > playerStats[playerId].bestMargin) playerStats[playerId].bestMargin = margin; }
                } else { const margin = playerTotals[playerId] - lowestScore; if (margin > playerStats[playerId].worstMargin) playerStats[playerId].worstMargin = margin; }
            }
        }
    }
    playerStats._totalUniqueHands = totalUniqueHands;
    return playerStats;
}

function formatStatWinners(winners, value, suffix) {
    var names;
    if (winners.length === 1) names = winners[0];
    else if (winners.length === 2) names = winners[0] + ' & ' + winners[1];
    else names = winners[0] + ' (+' + (winners.length - 1) + ' tied)';
    return { names: names, value: value + (suffix ? ' ' + suffix : '') };
}

function displayOverallStats(stats, totalSessions) {
    let totalHands = stats._totalUniqueHands || 0;
    const statValues = {
        sessionsWon: { best: -Infinity, winners: [], value: null, suffix: 'wins' },
        handsWon: { best: -Infinity, winners: [], value: null, suffix: 'hands' },
        sessionWinRate: { best: -Infinity, winners: [], value: null, suffix: '%' },
        handWinRate: { best: -Infinity, winners: [], value: null, suffix: '%' },
        avgScore: { best: Infinity, winners: [], value: null, suffix: '', lower: true },
        falseLockouts: { best: -Infinity, winners: [], value: null, suffix: 'times' },
        handStreak: { best: -Infinity, winners: [], value: null, suffix: 'hands' },
        avgLockout: { best: Infinity, winners: [], value: null, suffix: '', lower: true }
    };
    for (let playerId in stats) {
        if (playerId === '_totalUniqueHands') continue;
        const ps = stats[playerId];
        const sw = ps.sessionsWon;
        if (sw > statValues.sessionsWon.best) { statValues.sessionsWon.best = sw; statValues.sessionsWon.winners = [ps.username]; statValues.sessionsWon.value = sw.toFixed(1); } else if (sw === statValues.sessionsWon.best) statValues.sessionsWon.winners.push(ps.username);
        const hw = ps.handsWon;
        if (hw > statValues.handsWon.best) { statValues.handsWon.best = hw; statValues.handsWon.winners = [ps.username]; statValues.handsWon.value = hw; } else if (hw === statValues.handsWon.best) statValues.handsWon.winners.push(ps.username);
        if (ps.sessionsPlayed > 0) { const swr = (ps.sessionsWon / ps.sessionsPlayed) * 100; if (swr > statValues.sessionWinRate.best) { statValues.sessionWinRate.best = swr; statValues.sessionWinRate.winners = [ps.username]; statValues.sessionWinRate.value = swr.toFixed(1); } else if (swr === statValues.sessionWinRate.best) statValues.sessionWinRate.winners.push(ps.username); }
        if (ps.handsPlayed > 0) { const hwr = (ps.handsWon / ps.handsPlayed) * 100; if (hwr > statValues.handWinRate.best) { statValues.handWinRate.best = hwr; statValues.handWinRate.winners = [ps.username]; statValues.handWinRate.value = hwr.toFixed(1); } else if (hwr === statValues.handWinRate.best) statValues.handWinRate.winners.push(ps.username); }
        if (ps.handsPlayed > 0) { const avg = ps.totalScore / ps.handsPlayed; if (avg < statValues.avgScore.best) { statValues.avgScore.best = avg; statValues.avgScore.winners = [ps.username]; statValues.avgScore.value = avg.toFixed(2); } else if (avg === statValues.avgScore.best) statValues.avgScore.winners.push(ps.username); }
        const fl = ps.falseLockouts;
        if (fl > statValues.falseLockouts.best) { statValues.falseLockouts.best = fl; statValues.falseLockouts.winners = [ps.username]; statValues.falseLockouts.value = fl; } else if (fl === statValues.falseLockouts.best) statValues.falseLockouts.winners.push(ps.username);
        const hs = ps.maxHandStreak;
        if (hs > statValues.handStreak.best) { statValues.handStreak.best = hs; statValues.handStreak.winners = [ps.username]; statValues.handStreak.value = hs; } else if (hs === statValues.handStreak.best) statValues.handStreak.winners.push(ps.username);
        if (ps.lockoutScores.length > 0) { const als = ps.lockoutScores.reduce((sum, score) => sum + score, 0) / ps.lockoutScores.length; if (als < statValues.avgLockout.best) { statValues.avgLockout.best = als; statValues.avgLockout.winners = [ps.username]; statValues.avgLockout.value = als.toFixed(2); } else if (als === statValues.avgLockout.best) statValues.avgLockout.winners.push(ps.username); }
    }
    const mostSessionsWon = formatStatWinners(statValues.sessionsWon.winners.length ? statValues.sessionsWon.winners : ['N/A'], statValues.sessionsWon.value || '0', 'wins');
    const mostHandsWon = formatStatWinners(statValues.handsWon.winners.length ? statValues.handsWon.winners : ['N/A'], statValues.handsWon.value || '0', 'hands');
    const bestSessionWinRate = formatStatWinners(statValues.sessionWinRate.winners.length ? statValues.sessionWinRate.winners : ['N/A'], statValues.sessionWinRate.value || '0', '%');
    const bestHandWinRate = formatStatWinners(statValues.handWinRate.winners.length ? statValues.handWinRate.winners : ['N/A'], statValues.handWinRate.value || '0', '%');
    const lowestAvgScore = formatStatWinners(statValues.avgScore.winners.length ? statValues.avgScore.winners : ['N/A'], statValues.avgScore.value || '0', '');
    const mostFalseLockouts = formatStatWinners(statValues.falseLockouts.winners.length ? statValues.falseLockouts.winners : ['N/A'], statValues.falseLockouts.value || '0', 'times');
    const longestHandStreak = formatStatWinners(statValues.handStreak.winners.length ? statValues.handStreak.winners : ['N/A'], statValues.handStreak.value || '0', 'hands');
    const bestAvgLockoutScore = formatStatWinners(statValues.avgLockout.winners.length ? statValues.avgLockout.winners : ['N/A'], statValues.avgLockout.value || '0', '');

    let html = '<div class="stats-grid">';
    html += '<div class="stat-card"><h4>Total Sessions</h4><p class="stat-value">' + totalSessions + '</p></div>';
    html += '<div class="stat-card"><h4>Total Hands</h4><p class="stat-value">' + totalHands + '</p></div>';
    html += '<div class="stat-card"><h4>Most Sessions Won</h4><p class="stat-value">' + mostSessionsWon.names + '</p><p>' + mostSessionsWon.value + '</p></div>';
    html += '<div class="stat-card"><h4>Most Hands Won</h4><p class="stat-value">' + mostHandsWon.names + '</p><p>' + mostHandsWon.value + '</p></div>';
    html += '<div class="stat-card"><h4>Best Session Win Rate</h4><p class="stat-value">' + bestSessionWinRate.names + '</p><p>' + bestSessionWinRate.value + '</p></div>';
    html += '<div class="stat-card"><h4>Best Hand Win Rate</h4><p class="stat-value">' + bestHandWinRate.names + '</p><p>' + bestHandWinRate.value + '</p></div>';
    html += '<div class="stat-card"><h4>Lowest Avg Score/Hand</h4><p class="stat-value">' + lowestAvgScore.names + '</p><p>' + lowestAvgScore.value + '</p></div>';
    html += '<div class="stat-card"><h4>Best Avg Lockout Score</h4><p class="stat-value">' + bestAvgLockoutScore.names + '</p><p>' + bestAvgLockoutScore.value + '</p></div>';
    html += '<div class="stat-card"><h4>Longest Hand Streak</h4><p class="stat-value">' + longestHandStreak.names + '</p><p>' + longestHandStreak.value + '</p></div>';
    html += '<div class="stat-card"><h4>Most False Lockouts</h4><p class="stat-value">' + mostFalseLockouts.names + '</p><p>' + mostFalseLockouts.value + '</p></div>';
    html += '</div>';
    html += '<div class="warning-box mt-15 mb-15 text-sm"><strong>ℹ️ Note:</strong> Hand-level stats include active sessions. Session-level stats only include completed sessions. <strong>LO Rate</strong> = successful lockouts ÷ hands played. <strong>False LO Rate</strong> = false lockouts ÷ total lockout attempts.</div>';
    html += '<h3 class="mt-20">Player Breakdown</h3>';
    html += '<p class="text-muted text-sm mb-10">💡 Click column headers to sort</p>';
    html += '<div class="overflow-x-auto"><table class="scores-table" id="playerBreakdownTable"><tr>';
    html += '<th onclick="sortStatsTable(0)" style="cursor: pointer; user-select: none;">Player ⇅</th>';
    html += '<th onclick="sortStatsTable(1)" style="cursor: pointer; user-select: none;">Sessions ⇅</th>';
    html += '<th onclick="sortStatsTable(2)" style="cursor: pointer; user-select: none;">Wins ⇅</th>';
    html += '<th onclick="sortStatsTable(3)" style="cursor: pointer; user-select: none;">Win Rate ⇅</th>';
    html += '<th onclick="sortStatsTable(4)" style="cursor: pointer; user-select: none;">Hands ⇅</th>';
    html += '<th onclick="sortStatsTable(5)" style="cursor: pointer; user-select: none;">Avg Hand ⇅</th>';
    html += '<th onclick="sortStatsTable(6)" style="cursor: pointer; user-select: none;">Lockouts ⇅</th>';
    html += '<th onclick="sortStatsTable(7)" style="cursor: pointer; user-select: none;">LO Rate ⇅</th>';
    html += '<th onclick="sortStatsTable(8)" style="cursor: pointer; user-select: none;">Avg LO Score ⇅</th>';
    html += '<th onclick="sortStatsTable(9)" style="cursor: pointer; user-select: none;">False Lockouts ⇅</th>';
    html += '<th onclick="sortStatsTable(10)" style="cursor: pointer; user-select: none;">False LO Rate ⇅</th>';
    html += '<th onclick="sortStatsTable(11)" style="cursor: pointer; user-select: none;">Avg False LO Score ⇅</th>';
    html += '</tr>';
    for (let playerId in stats) {
        if (playerId === '_totalUniqueHands') continue;
        const ps = stats[playerId];
        const sessionWinRate = ps.sessionsPlayed > 0 ? ((ps.sessionsWon / ps.sessionsPlayed) * 100).toFixed(1) : '0';
        const lockoutRate = ps.handsPlayed > 0 ? ((ps.handsWon / ps.handsPlayed) * 100).toFixed(1) : '0';
        const avgScore = ps.handsPlayed > 0 ? (ps.totalScore / ps.handsPlayed).toFixed(2) : '0';
        const falseLockoutRate = ps.totalLockouts > 0 ? ((ps.falseLockouts / ps.totalLockouts) * 100).toFixed(1) : '0';
        const avgLockoutScore = ps.lockoutScores.length > 0 ? (ps.lockoutScores.reduce((sum, score) => sum + score, 0) / ps.lockoutScores.length).toFixed(2) : 'N/A';
        const avgFalseLockoutScore = ps.falseLockoutScores.length > 0 ? (ps.falseLockoutScores.reduce((sum, score) => sum + score, 0) / ps.falseLockoutScores.length).toFixed(2) : 'N/A';
        html += '<tr><td>' + ps.username + formatEloBadge(playerId) + '</td><td>' + ps.sessionsPlayed + '</td><td>' + ps.sessionsWon.toFixed(1) + '</td><td>' + sessionWinRate + '%</td><td>' + ps.handsPlayed + '</td><td>' + avgScore + '</td><td>' + ps.handsWon + '</td><td>' + lockoutRate + '%</td><td>' + avgLockoutScore + '</td><td>' + ps.falseLockouts + '</td><td>' + falseLockoutRate + '%</td><td>' + avgFalseLockoutScore + '</td></tr>';
    }
    html += '</table></div>';
    document.getElementById('statsContent').innerHTML = html;
}

async function showOverallStats() {
    const intentId = beginNavigationIntent();
    const contentDiv = document.getElementById('statsContent');
    contentDiv.innerHTML = '<div class="loading">Loading overall stats...</div>';
    await loadStats(intentId);
}

async function recalculateElo(event) {
    alert('Elo recalculation is available only from the private “Lockout Admin” menu in the Google Sheet.');
}

// ============================================
// HEAD-TO-HEAD STATS
// ============================================
async function showHeadToHeadList(requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    const contentDiv = document.getElementById('statsContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-15">Loading head-to-head records...</h3>' +
            '<div class="h2h-matchup-card"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-100 skeleton-h-8 mb-10"></div><div class="shimmer-wrapper skeleton-button skeleton-h-40"></div></div>' +
            '<div class="h2h-matchup-card"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-100 skeleton-h-8 mb-10"></div><div class="shimmer-wrapper skeleton-button skeleton-h-40"></div></div>' +
            '<div class="h2h-matchup-card"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-100 skeleton-h-8 mb-10"></div><div class="shimmer-wrapper skeleton-button skeleton-h-40"></div></div>' +
        '</div>';

    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return;
    const data = await apiCall('getHeadToHeadMatrix', {});
    if (!isCurrentNavigationIntent(intentId)) return;
    if (data.error) { contentDiv.innerHTML = '<div class="error">Error loading data: ' + data.error + '</div>'; return; }
    if (data.length === 0) { contentDiv.innerHTML = '<div class="placeholder-content"><h3>Not Enough Data</h3><p>Play more sessions to see head-to-head records!</p></div>'; return; }

    data.sort(function(a, b) { return b.sessions_together - a.sessions_together; });

    let html = '<h2>⚔️ Head-to-Head Records</h2>';
    html += '<p class="text-muted mb-20">Direct records when playing in the same session (who finished with a lower score)</p>';
    html += '<div style="display: grid; gap: 15px; margin-bottom: 20px;">';

    for (let i = 0; i < data.length; i++) {
        const m = data[i];
        const p1Name = getPlayerName(m.p1), p2Name = getPlayerName(m.p2);
        const total = m.p1_wins + m.p2_wins + m.ties;
        if (total === 0) continue;
        const p1Pct = Math.round((m.p1_wins / total) * 100);
        const drawPct = Math.round((m.ties / total) * 100);
        const p2Pct = Math.round((m.p2_wins / total) * 100);

        html += '<div class="h2h-matchup-card">';
        html += '<div class="h2h-matchup-header">';
        html += '<strong class="heading-blue">' + p1Name + '</strong>';
        html += '<span class="h2h-score-span">' + m.p1_wins + '-' + m.ties + '-' + m.p2_wins + '</span>';
        html += '<strong class="heading-red">' + p2Name + '</strong>';
        html += '</div>';
        html += '<div class="h2h-bar-wrapper">';
        html += '<div style="width: ' + p1Pct + '%; background: #667eea;"></div>';
        html += '<div style="width: ' + drawPct + '%; background: #aaaaaa;"></div>';
        html += '<div style="width: ' + p2Pct + '%; background: #f5576c;"></div>';
        html += '</div>';
        html += '<div class="h2h-pct-row">';
        html += '<span>' + p1Pct + '%</span>';
        html += '<span>' + m.sessions_together + ' session' + (m.sessions_together > 1 ? 's' : '') + ' together • W-D-L</span>';
        html += '<span>' + p2Pct + '%</span>';
        html += '</div>';
        html += '<button class="btn btn-small btn-info" onclick="quickCompare(' + m.p1 + ', ' + m.p2 + ')" style="width: 100%;">View Detailed Comparison</button>';
        html += '</div>';
    }

    html += '</div>';
    contentDiv.innerHTML = html;
}

async function quickCompare(p1Id, p2Id) {
    const intentId = beginNavigationIntent();
    showScreen('statsScreen', false, intentId);
    await showPlayerComparisonUI(intentId);
    if (!isCurrentNavigationIntent(intentId)) return;
    const player1 = document.getElementById('comparisonPlayer1');
    const player2 = document.getElementById('comparisonPlayer2');
    if (!player1 || !player2) return;
    player1.value = p1Id;
    player2.value = p2Id;
    showPlayerComparison(intentId);
}

// ============================================
// PLAYER COMPARISON
// ============================================
async function showPlayerComparisonUI(requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return false;
    const contentDiv = document.getElementById('statsContent');
    let html = '<h3 class="mb-20">⚔️ Compare Two Players</h3>';
    html += '<div class="comparison-player-grid">';
    html += '<div><label class="heading-blue">Player 1</label>';
    html += '<select id="comparisonPlayer1" class="comparison-select-p1"><option value="">Select player...</option>';
    for (let i = 0; i < allPlayers.length; i++) html += '<option value="' + allPlayers[i].player_id + '">' + allPlayers[i].username + '</option>';
    html += '</select></div>';
    html += '<div><label class="heading-red">Player 2</label>';
    html += '<select id="comparisonPlayer2" class="comparison-select-p2"><option value="">Select player...</option>';
    for (let i = 0; i < allPlayers.length; i++) html += '<option value="' + allPlayers[i].player_id + '">' + allPlayers[i].username + '</option>';
    html += '</select></div>';
    html += '</div>';
    html += '<button class="btn btn-success" id="comparePlayersBtn" style="width: 100%;">Compare Players</button>';
    contentDiv.innerHTML = html;
    setTimeout(function() {
        if (!isCurrentNavigationIntent(intentId)) return;
        const btn = document.getElementById('comparePlayersBtn');
        if (btn) btn.addEventListener('click', showPlayerComparison);
    }, 50);
    return true;
}

async function showPlayerComparison(requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return;
    const contentDiv = document.getElementById('statsContent');
    const p1Select = document.getElementById('comparisonPlayer1');
    const p2Select = document.getElementById('comparisonPlayer2');
    if (!p1Select || !p2Select) { contentDiv.innerHTML = '<div class="error">Error: Please select players from the dropdowns above.</div>'; return; }
    const p1Id = p1Select.value, p2Id = p2Select.value;
    if (!p1Id || !p2Id) { contentDiv.innerHTML = '<div class="error">Please select two players</div>'; return; }
    if (p1Id === p2Id) { contentDiv.innerHTML = '<div class="error">Please select two different players</div>'; return; }

    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-20">Loading player comparison...</h3>' +
            '<div class="overflow-x-auto">' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
                '<div class="skeleton-table-row"><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div><div class="shimmer-wrapper skeleton-table-cell"></div></div>' +
            '</div>' +
        '</div>';

    showScreen('statsScreen', false, intentId);
    const data = await apiCall('getPlayerComparisonDetailed', { player1_id: p1Id, player2_id: p2Id });
    if (!isCurrentNavigationIntent(intentId)) return;
    if (data.error) { contentDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>'; return; }

    const p1Name = getPlayerName(p1Id), p2Name = getPlayerName(p2Id);
    let html = '';

    html += '<div class="comparison-vs-header"><h2 class="comparison-vs-title">' + p1Name + ' ' + formatEloBadge(p1Id) + ' vs ' + p2Name + ' ' + formatEloBadge(p2Id) + '</h2></div>';
    html += '<button class="btn btn-info mb-20" onclick="showPlayerComparisonUI()" style="width: 100%;">← Change Players</button>';

    const ts = data.sessions_together_stats;

    html += '<div class="section-box section-box-blue">';
    html += '<h3 class="section-heading-blue">📊 Sessions Together</h3>';
    html += '<p class="text-muted text-sm mb-20"><strong>Head-to-head record:</strong> Who finished with a lower score when both players competed in the same session (regardless of who won overall)</p>';

    if (ts.total_sessions === 0) {
        html += '<div class="content-card" style="text-align: center; color: #666;">These players have never played together</div>';
    } else {
        html += '<div class="overflow-x-auto"><table class="scores-table">';
        html += '<tr><th>Stat</th><th style="color: white; background: #667eea;">' + p1Name + '</th><th style="color: white; background: #f5576c;">' + p2Name + '</th></tr>';
        html += '<tr><td><strong>Wins</strong></td><td>' + ts.p1_wins + '</td><td>' + ts.p2_wins + '</td></tr>';
        html += '<tr><td><strong>Win Rate</strong></td><td>' + ts.p1_win_rate + '%</td><td>' + ts.p2_win_rate + '%</td></tr>';
        html += '<tr><td><strong>Total Score</strong></td><td>' + ts.p1_total_score + '</td><td>' + ts.p2_total_score + '</td></tr>';
        html += '<tr><td><strong>Hands Played</strong></td><td>' + ts.p1_total_hands + '</td><td>' + ts.p2_total_hands + '</td></tr>';
        html += '<tr><td><strong>Avg Hand</strong></td><td>' + ts.p1_avg_hand + '</td><td>' + ts.p2_avg_hand + '</td></tr>';
        html += '<tr><td><strong>Lockouts</strong></td><td>' + ts.p1_lockouts + '</td><td>' + ts.p2_lockouts + '</td></tr>';
        html += '<tr><td><strong>Lockout Rate</strong></td><td>' + ts.p1_lockout_rate + '%</td><td>' + ts.p2_lockout_rate + '%</td></tr>';
        html += '<tr><td><strong>Avg Lockout Score</strong></td><td>' + (ts.p1_lockouts > 0 ? ts.p1_avg_lockout : 'N/A') + '</td><td>' + (ts.p2_lockouts > 0 ? ts.p2_avg_lockout : 'N/A') + '</td></tr>';
        html += '<tr><td><strong>False Lockouts</strong></td><td>' + ts.p1_false_lockouts + '</td><td>' + ts.p2_false_lockouts + '</td></tr>';
        html += '<tr><td><strong>False Lockout Rate</strong></td><td>' + (ts.p1_false_lockouts + ts.p1_lockouts > 0 ? ts.p1_false_lockout_rate + '%' : 'N/A') + '</td><td>' + (ts.p2_false_lockouts + ts.p2_lockouts > 0 ? ts.p2_false_lockout_rate + '%' : 'N/A') + '</td></tr>';
        html += '<tr><td><strong>Avg False LO Score</strong></td><td>' + (ts.p1_false_lockouts > 0 ? ts.p1_avg_false_lockout : 'N/A') + '</td><td>' + (ts.p2_false_lockouts > 0 ? ts.p2_avg_false_lockout : 'N/A') + '</td></tr>';
        html += '</table></div>';

        if (ts.best_with && ts.worst_with && ts.best_with.player_id !== ts.worst_with.player_id) {
            html += '<div class="warning-box mt-20">';
            html += '<h4 class="comparison-context-heading">📊 Performance Context</h4>';
            html += '<p class="text-muted text-sm mb-10">When ' + p1Name + ' plays against ' + p2Name + ' <strong>head-to-head</strong>, ' + p1Name + '\'s win rate varies depending on who else is playing:</p>';
            html += '<div class="content-card-sm"><div style="font-size: 0.85em; color: #4caf50; font-weight: 600; margin-bottom: 3px;">✅ Best with ' + getPlayerName(ts.best_with.player_id) + '</div>';
            html += '<div class="text-sm" style="color: #333;">' + p1Name + ' beats ' + p2Name + ' in ' + ts.best_with.wins + ' out of ' + ts.best_with.total + ' sessions when ' + getPlayerName(ts.best_with.player_id) + ' is also playing</div></div>';
            html += '<div class="content-card-sm"><div style="font-size: 0.85em; color: #f44336; font-weight: 600; margin-bottom: 3px;">❌ Worst with ' + getPlayerName(ts.worst_with.player_id) + '</div>';
            html += '<div class="text-sm" style="color: #333;">' + p1Name + ' beats ' + p2Name + ' in ' + ts.worst_with.wins + ' out of ' + ts.worst_with.total + ' sessions when ' + getPlayerName(ts.worst_with.player_id) + ' is also playing</div></div>';
            html += '</div>';
        }
    }
    html += '</div>';

    const as1 = data.all_sessions_stats.player1, as2 = data.all_sessions_stats.player2;
    html += '<div class="section-box section-box-red">';
    html += '<h3 class="section-heading-red">📊 All Sessions</h3>';
    html += '<p class="text-muted text-sm mb-20"><strong>Overall wins:</strong> Sessions where each player had the lowest score and won outright (across all sessions they participated in)</p>';
    html += '<div class="overflow-x-auto"><table class="scores-table">';
    html += '<tr><th>Stat</th><th style="color: white; background: #667eea;">' + p1Name + '</th><th style="color: white; background: #f5576c;">' + p2Name + '</th></tr>';
    html += '<tr><td><strong>Wins</strong></td><td>' + as1.wins + '</td><td>' + as2.wins + '</td></tr>';
    html += '<tr><td><strong>Losses</strong></td><td>' + as1.losses + '</td><td>' + as2.losses + '</td></tr>';
    if (as1.ties > 0 || as2.ties > 0) html += '<tr><td><strong>Ties</strong></td><td>' + as1.ties + '</td><td>' + as2.ties + '</td></tr>';
    html += '<tr><td><strong>Win Rate</strong></td><td>' + as1.win_rate + '%</td><td>' + as2.win_rate + '%</td></tr>';
    html += '<tr><td><strong>Total Score</strong></td><td>' + as1.total_score + '</td><td>' + as2.total_score + '</td></tr>';
    html += '<tr><td><strong>Hands Played</strong></td><td>' + as1.total_hands + '</td><td>' + as2.total_hands + '</td></tr>';
    html += '<tr><td><strong>Avg Hand</strong></td><td>' + as1.avg_hand + '</td><td>' + as2.avg_hand + '</td></tr>';
    html += '<tr><td><strong>Lockouts</strong></td><td>' + as1.lockouts + '</td><td>' + as2.lockouts + '</td></tr>';
    html += '<tr><td><strong>Lockout Rate</strong></td><td>' + as1.lockout_rate + '%</td><td>' + as2.lockout_rate + '%</td></tr>';
    html += '<tr><td><strong>Avg Lockout Score</strong></td><td>' + (as1.lockouts > 0 ? as1.avg_lockout : 'N/A') + '</td><td>' + (as2.lockouts > 0 ? as2.avg_lockout : 'N/A') + '</td></tr>';
    html += '<tr><td><strong>False Lockouts</strong></td><td>' + as1.false_lockouts + '</td><td>' + as2.false_lockouts + '</td></tr>';
    html += '<tr><td><strong>False Lockout Rate</strong></td><td>' + (as1.false_lockouts + as1.lockouts > 0 ? as1.false_lockout_rate + '%' : 'N/A') + '</td><td>' + (as2.false_lockouts + as2.lockouts > 0 ? as2.false_lockout_rate + '%' : 'N/A') + '</td></tr>';
    html += '<tr><td><strong>Avg False LO Score</strong></td><td>' + (as1.false_lockouts > 0 ? as1.avg_false_lockout : 'N/A') + '</td><td>' + (as2.false_lockouts > 0 ? as2.avg_false_lockout : 'N/A') + '</td></tr>';
    html += '</table></div></div>';

    if (data.sessions_together.length > 0) {
        html += '<div class="section-box section-box-purple">';
        html += '<h3 class="section-heading-purple">📅 Session History</h3>';
        html += '<p class="text-muted text-sm mb-20">Sessions where both players competed (click to view details)</p>';

        for (let i = data.sessions_together.length - 1; i >= 0; i--) {
            const s = data.sessions_together[i];
            const winner = s.p1_won && !s.p2_won ? p1Name : s.p2_won && !s.p1_won ? p2Name : 'Tie';
            const winnerColor = s.p1_won && !s.p2_won ? '#667eea' : s.p2_won && !s.p1_won ? '#f5576c' : '#ff9800';
            var cleanDate = formatUKDate(s.date);

            html += '<div class="session-history-card" onclick="viewSessionDetailFromComparison(' + s.session_id + ', this)">';
            html += '<div class="session-history-card-header">';
            html += '<div class="session-history-title">' + s.title + ' 🔗</div>';
            html += '<div style="color: ' + winnerColor + '; font-weight: 600; font-size: 1em; padding: 4px 12px; background: ' + winnerColor + '20; border-radius: 12px;">' + winner + '</div>';
            html += '</div>';
            html += '<div class="text-muted text-sm mb-10">' + cleanDate + ' • ' + s.player_count + ' players</div>';
            html += '<div class="session-history-scores">';
            html += '<div class="text-sm"><strong class="heading-blue">' + p1Name + ':</strong> ' + s.p1_score + ' pts</div>';
            html += '<div class="text-sm"><strong class="heading-red">' + p2Name + ':</strong> ' + s.p2_score + ' pts</div>';
            html += '</div></div>';
        }
        html += '</div>';
    }

    contentDiv.innerHTML = html;
}

// ============================================
// DICTIONARY SECTION TOGGLE
// ============================================
function showDictionarySection(section, targetId) {
    const intentId = getNavigationIntent();
    if (section === 'lingo') {
        document.getElementById('lingoSection').style.display = 'block';
        document.getElementById('glossarySection').style.display = 'none';
    } else {
        document.getElementById('lingoSection').style.display = 'none';
        document.getElementById('glossarySection').style.display = 'block';
    }
if (targetId) {
    setTimeout(function() {
        if (!isCurrentNavigationIntent(intentId)) return;
        var el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 300);
}
}

async function viewSessionDetailFromComparison(sessionId, buttonElement) {
    const intentId = beginNavigationIntent();
    if (buttonElement) setButtonLoading(buttonElement, true);
    if (allSessions.length === 0) await loadPreviousSessions(intentId);
    if (!isCurrentNavigationIntent(intentId)) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    const sessionIndex = allSessions.findIndex(s => String(s.session_id) === String(sessionId));
    if (sessionIndex !== -1) {
        viewSessionDetail(sessionIndex, buttonElement, intentId);
    } else {
        alert('Session not found');
        if (buttonElement) setButtonLoading(buttonElement, false);
    }
}

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('DOMContentLoaded', function() {
    console.log('Lockout Tracker ' + (window.LOCKOUT_CONFIG && window.LOCKOUT_CONFIG.version || 'v2 beta'));
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    updateEditingStatus();

    // Show both skeletons immediately and simultaneously
    document.getElementById('activeSessionsSection').innerHTML =
        '<div class="skeleton-card">' +
            '<p class="skeleton-loading-text">Loading active sessions...</p>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-50 mb-10" style="height:22px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-80 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-60" style="height:36px;"></div>' +
        '</div>';

    document.getElementById('eloLeaderboardSection').innerHTML =
        '<div class="skeleton-card">' +
            '<p class="skeleton-loading-text">Loading ELO rankings...</p>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-50 mb-10" style="height:22px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-80 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-60" style="height:36px;"></div>' +
        '</div>';

    ensurePlayersLoaded();
    Promise.all([checkActiveSessions(), displayEloLeaderboard()]);
    history.replaceState({ screen: 'homeScreen' }, '', '#homeScreen');
    showDictionarySection('lingo');
});

// ============================================
// BROWSER BACK BUTTON HANDLING
// ============================================
window.addEventListener('popstate', function(event) {
    if (event.state && event.state.screen) {
        showScreen(event.state.screen, true);
    } else {
        showScreen('homeScreen', true);
    }
});

// ============================================
// HAPTIC FEEDBACK EVENT LISTENER
// ============================================
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('btn')) hapticFeedback('light');
});

// ============================================
// EASTER EGG
// ============================================
let headerTapCount = 0;
let headerTapTimeout;

function handleHeaderClick(event) {
    const intentId = getNavigationIntent();
    headerTapCount++;
    clearTimeout(headerTapTimeout);
    if (headerTapCount >= 7) {
        headerTapCount = 0;
        triggerEasterEgg();
    } else if (headerTapCount === 3) {
        headerTapTimeout = setTimeout(function() {
            if (headerTapCount === 3) {
                const adminBtn = document.getElementById('adminRecalcBtn');
                if (adminBtn) {
                    const isVisible = adminBtn.style.display !== 'none';
                    adminBtn.style.display = isVisible ? 'none' : 'block';
                    if (!isVisible) hapticFeedback('medium');
                }
            }
            headerTapCount = 0;
        }, 800);
    } else {
        headerTapTimeout = setTimeout(function() {
            if (headerTapCount < 7) showScreen('homeScreen', false, intentId);
            headerTapCount = 0;
        }, 800);
    }
}

let easterEggCode = '';
let easterEggTimeout;

document.addEventListener('keypress', function(e) {
    clearTimeout(easterEggTimeout);
    easterEggCode += e.key.toLowerCase();
    if (easterEggCode.includes('lockout')) { easterEggCode = ''; triggerEasterEgg(); }
    easterEggTimeout = setTimeout(function() { easterEggCode = ''; }, 2000);
});

function triggerEasterEgg() {
    const duration = 3000, end = Date.now() + duration;
    (function frame() {
        confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#667eea', '#764ba2', '#f5576c'] });
        confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#667eea', '#764ba2', '#f5576c'] });
        if (Date.now() < end) requestAnimationFrame(frame);
    }());
    const message = document.createElement('div');
    message.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 50px; border-radius: 20px; font-size: 2em; font-weight: bold; z-index: 10000; box-shadow: 0 10px 40px rgba(0,0,0,0.3); animation: fadeIn 0.5s ease-in-out;';
    message.textContent = '🎉 YOU FOUND THE SECRET! 🎉';
    document.body.appendChild(message);
    hapticFeedback('success');
    setTimeout(function() {
        message.style.opacity = '0';
        message.style.transform = 'translate(-50%, -50%) scale(0.8)';
        message.style.transition = 'all 0.5s ease-out';
        setTimeout(function() { document.body.removeChild(message); }, 500);
    }, 3000);
}
// ============================================
// PIN HELPERS
// ============================================
function getStoredIdentity() {
    try {
        const raw = localStorage.getItem('lockout_identity');
        return raw ? JSON.parse(raw) : null;
    } catch(e) { return null; }
}

function storeIdentity(playerId, username) {
    localStorage.setItem('lockout_identity', JSON.stringify({ player_id: playerId, username: username }));
}

function clearIdentity() {
    localStorage.removeItem('lockout_identity');
}

// PIN Setup state
let _pinSetupBuffer = '';
let _pinSetupPlayerId = null;

function openPinSetupModal(playerId) {
    _pinSetupPlayerId = playerId;
    _pinSetupBuffer = '';
    updatePinDots('pinSetup', 0);
    document.getElementById('pinSetupMessage').innerHTML = '';
    document.getElementById('pinSetupModal').classList.add('active');
}

function closePinSetupModal() {
    document.getElementById('pinSetupModal').classList.remove('active');
    _pinSetupBuffer = '';
    _pinSetupPlayerId = null;
}

function updatePinDots(prefix, count) {
    for (let i = 0; i < 6; i++) {
        const dot = document.getElementById(prefix + 'Dot' + i);
        if (dot) dot.classList.toggle('filled', i < count);
    }
}

function pinSetupInput(digit) {
    if (_pinSetupBuffer.length >= 6) return;
    _pinSetupBuffer += digit;
    updatePinDots('pinSetup', _pinSetupBuffer.length);
    hapticFeedback('light');
    if (_pinSetupBuffer.length === 6) {
        setTimeout(confirmPinSetup, 200);
    }
}

function pinSetupClear() {
    if (_pinSetupBuffer.length > 0) {
        _pinSetupBuffer = _pinSetupBuffer.slice(0, -1);
        updatePinDots('pinSetup', _pinSetupBuffer.length);
        hapticFeedback('light');
    }
}

async function confirmPinSetup() {
    const messageDiv = document.getElementById('pinSetupMessage');
    if (!/^\d{6}$/.test(_pinSetupBuffer)) {
        messageDiv.innerHTML = '<div class="error">Enter all six digits.</div>';
        return;
    }
    const data = await apiCall('setPlayerPin', { player_id: _pinSetupPlayerId, pin: _pinSetupBuffer });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">❌ Could not save PIN. Please try again.</div>';
        _pinSetupBuffer = '';
        updatePinDots('pinSetup', 0);
    } else {
        messageDiv.innerHTML = '<div class="success">✅ PIN set!</div>';
        const player = allPlayers.find(p => String(p.player_id) === String(_pinSetupPlayerId));
        if (player) storeIdentity(_pinSetupPlayerId, player.username);
        if (data.profile_token) setProfileToken(_pinSetupPlayerId, data.profile_token);
        hapticFeedback('success');
        setTimeout(function() {
            closePinSetupModal();
            openEditProfileModal(_pinSetupPlayerId);
        }, 800);
    }
}

// PIN Entry state
let _pinEntryBuffer = '';
let _pinEntryPlayerId = null;
let _pinEntryCallback = null;

function openPinEntryModal(playerId, callback) {
    _pinEntryPlayerId = playerId;
    _pinEntryCallback = callback;
    _pinEntryBuffer = '';
    updatePinDots('pinEntry', 0);
    document.getElementById('pinEntryMessage').innerHTML = '';
    document.getElementById('pinEntryModal').classList.add('active');
}

function closePinEntryModal() {
    document.getElementById('pinEntryModal').classList.remove('active');
    _pinEntryBuffer = '';
    _pinEntryPlayerId = null;
    _pinEntryCallback = null;
}

function pinEntryInput(digit) {
    if (_pinEntryBuffer.length >= 6) return;
    _pinEntryBuffer += digit;
    updatePinDots('pinEntry', _pinEntryBuffer.length);
    hapticFeedback('light');
    if (_pinEntryBuffer.length === 6) {
        setTimeout(submitPinEntry, 200);
    }
}

function pinEntryClear() {
    if (_pinEntryBuffer.length > 0) {
        _pinEntryBuffer = _pinEntryBuffer.slice(0, -1);
        updatePinDots('pinEntry', _pinEntryBuffer.length);
        hapticFeedback('light');
    }
}

async function submitPinEntry() {
    const messageDiv = document.getElementById('pinEntryMessage');
    if (!/^\d{4}(\d{2})?$/.test(_pinEntryBuffer)) {
        messageDiv.innerHTML = '<div class="error">Enter your four- or six-digit PIN.</div>';
        return;
    }
    const data = await apiCall('verifyPlayerPin', { player_id: _pinEntryPlayerId, pin: _pinEntryBuffer });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">❌ Error verifying PIN.</div>';
        _pinEntryBuffer = '';
        updatePinDots('pinEntry', 0);
        return;
    }
    if (data.success) {
        const player = allPlayers.find(p => String(p.player_id) === String(_pinEntryPlayerId));
        if (player) storeIdentity(_pinEntryPlayerId, player.username);
        if (data.profile_token) setProfileToken(_pinEntryPlayerId, data.profile_token);
        hapticFeedback('success');
        const cb = _pinEntryCallback;
        closePinEntryModal();
        if (cb) cb();
    } else {
        messageDiv.innerHTML = '<div class="error">❌ Incorrect PIN. Try again.</div>';
        hapticFeedback('error');
        _pinEntryBuffer = '';
        updatePinDots('pinEntry', 0);
    }
}

// ============================================
// PLAYER PROFILES
// ============================================
let _currentProfileId = null;
let _currentProfileData = null;

function makePlayerLink(playerId, displayName) {
    return '<span class="player-link" onclick="showPlayerProfile(\'' + playerId + '\')">' + displayName + '</span>';
}

async function loadPlayersScreen(requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : getNavigationIntent();
    const contentDiv = document.getElementById('playersScreenContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<div class="players-grid">' +
                '<div class="skeleton-player-card"><div class="shimmer-wrapper skeleton-avatar"></div><div class="shimmer-wrapper skeleton-text skeleton-w-70 mt-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-50 mt-10"></div></div>' +
                '<div class="skeleton-player-card"><div class="shimmer-wrapper skeleton-avatar"></div><div class="shimmer-wrapper skeleton-text skeleton-w-70 mt-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-50 mt-10"></div></div>' +
                '<div class="skeleton-player-card"><div class="shimmer-wrapper skeleton-avatar"></div><div class="shimmer-wrapper skeleton-text skeleton-w-70 mt-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-50 mt-10"></div></div>' +
                '<div class="skeleton-player-card"><div class="shimmer-wrapper skeleton-avatar"></div><div class="shimmer-wrapper skeleton-text skeleton-w-70 mt-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-50 mt-10"></div></div>' +
            '</div>' +
        '</div>';
    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return false;
    await loadEloRatings();
    if (!isCurrentNavigationIntent(intentId)) return false;
    if (allPlayers.length === 0) {
        contentDiv.innerHTML = '<div class="placeholder-content"><p>No players found.</p></div>';
        return;
    }
    let html = '<div class="players-grid">';
    for (let i = 0; i < allPlayers.length; i++) {
        const p = allPlayers[i];
        const elo = getPlayerElo(p.player_id);
        const eloText = elo ? '⚡ ' + elo.rating + (elo.provisional ? '?' : '') : '';
        const avatarUrl = p.avatar_url || '';
        let avatarHtml;
        if (avatarUrl) {
            avatarHtml = '<img src="' + avatarUrl + '" class="player-card-avatar" alt="' + p.username + '">';
        } else {
            avatarHtml = '<div class="player-card-avatar-placeholder">' + p.username.charAt(0).toUpperCase() + '</div>';
        }
        html += '<button type="button" class="player-card" onclick="showPlayerProfile(' + p.player_id + ')" aria-label="View ' + escapeAttr(decodeHtml(p.username)) + ' profile">';
        html += avatarHtml;
        html += '<div class="player-card-name">' + p.username + '</div>';
        html += '<div class="player-card-elo">' + eloText + '</div>';
        html += '</button>';
    }
    html += '</div>';
    contentDiv.innerHTML = html;
    return true;
}

async function showPlayerProfile(playerId, requestedIntentId) {
    _currentProfileId = playerId;
    const intentId = showScreen('playerProfileScreen', false, requestedIntentId);
    const contentDiv = document.getElementById('playerProfileContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<div class="shimmer-wrapper" style="height:120px; border-radius:12px; margin-bottom:20px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-100 mb-10" style="height:80px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-100 mb-10" style="height:120px;"></div>' +
        '</div>';

    // Validate stored identity against sheet on every load
    const identity = getStoredIdentity();
    if (identity && String(identity.player_id) === String(playerId)) {
        const pinCheck = await apiCall('checkPlayerPin', { player_id: playerId });
        if (!isCurrentNavigationIntent(intentId)) return;
        if (pinCheck.error || !pinCheck.has_pin) {
            clearIdentity();
        }
    }

    const data = await apiCall('getPlayerProfile', { player_id: playerId });
    if (!isCurrentNavigationIntent(intentId)) return;
    if (data.error) {
        contentDiv.innerHTML = '<div class="error">Error loading profile: ' + data.error + '</div>';
        return;
    }
    _currentProfileData = data;
    renderPlayerProfile(data);
}

function renderPlayerProfile(data) {
    const contentDiv = document.getElementById('playerProfileContent');
    const p = data.player;
    const stats = data.stats;
    const elo = data.elo;

    // Check if this is the logged-in player
    const identity = getStoredIdentity();
    const isOwnProfile = identity && String(identity.player_id) === String(p.player_id);

    // Avatar
    let avatarHtml;
    if (p.avatar_url) {
        avatarHtml = '<img src="' + p.avatar_url + '" class="profile-avatar" onclick="openPhotoFullscreen(\'' + p.avatar_url + '\')">';
    } else {
        avatarHtml = '<div class="profile-avatar-placeholder">' + p.username.charAt(0).toUpperCase() + '</div>';
    }

    // ELO badge
    const eloText = elo.current + (elo.provisional ? '?' : '');
    const eloChangeStr = elo.change >= 0 ? '+' + elo.change : String(elo.change);
    const eloChangeColor = elo.change > 0 ? '#4caf50' : elo.change < 0 ? '#f5576c' : 'rgba(255,255,255,0.5)';

    let html = '';

    // Header
    html += '<div class="profile-header">';
    html += avatarHtml;
    html += '<div class="profile-header-info">';
    html += '<div class="profile-name">' + p.username + '</div>';
    if (p.bio) html += '<div class="profile-bio">"' + p.bio + '"</div>';
    html += '<div><span class="elo-badge">⚡ ' + eloText + '</span>';
    html += ' <span style="color:' + eloChangeColor + '; font-size:0.8em;">(' + eloChangeStr + ')</span></div>';
    html += '<div class="profile-joined">Member since ' + formatUKDate(p.date_joined) + '</div>';
    if (isOwnProfile) {
        html += '<button class="profile-edit-btn" onclick="handleEditProfileClick()">✏️ Edit Profile</button>';
    } else {
        html += '<button class="profile-edit-btn" onclick="handleEditProfileClick()">✏️ Edit Profile</button>';
    }
    html += '</div></div>';

    // Key stats
    html += '<div class="profile-stats-row">';
    html += '<div class="profile-stat-cell"><div class="profile-stat-value">' + stats.sessions_played + '</div><div class="profile-stat-label">Sessions</div></div>';
    html += '<div class="profile-stat-cell"><div class="profile-stat-value">' + stats.sessions_won + '</div><div class="profile-stat-label">Wins</div></div>';
    html += '<div class="profile-stat-cell"><div class="profile-stat-value">' + stats.win_rate + '%</div><div class="profile-stat-label">Win Rate</div></div>';
    html += '<div class="profile-stat-cell"><div class="profile-stat-value">' + stats.hands_played + '</div><div class="profile-stat-label">Hands</div></div>';
    html += '<div class="profile-stat-cell"><div class="profile-stat-value">' + stats.avg_hand + '</div><div class="profile-stat-label">Avg Hand</div></div>';
    html += '<div class="profile-stat-cell"><div class="profile-stat-value">' + (stats.avg_lockout || 'N/A') + '</div><div class="profile-stat-label">Avg LO</div></div>';
    html += '</div>';

    // Achievements
    html += renderAchievements(data.achievements);

    // ELO history chart
    html += '<div class="section-box section-box-blue mt-20">';
    html += '<h3 class="section-heading-blue">📈 ELO History</h3>';
    if (elo.history.length < 2) {
        html += '<p class="text-muted text-sm">Not enough sessions to show a chart yet.</p>';
    } else {
        html += '<div class="elo-chart-container" id="profileEloChart" style="height:200px;"><canvas id="profileEloCanvas"></canvas></div>';
    }
    html += '</div>';

    // H2H summary
    if (data.h2h_summary && data.h2h_summary.length > 0) {
        html += '<div class="section-box section-box-red mt-20">';
        html += '<h3 class="section-heading-red">⚔️ Head-to-Head</h3>';
        for (let i = 0; i < data.h2h_summary.length; i++) {
            const h = data.h2h_summary[i];
            const total = h.total;
            const winPct = total > 0 ? Math.round((h.wins / total) * 100) : 0;
            const lossPct = total > 0 ? Math.round((h.losses / total) * 100) : 0;
            const tiePct = 100 - winPct - lossPct;
            html += '<div class="h2h-summary-row" onclick="quickCompare(' + _currentProfileId + ', ' + h.opponent_id + ')">';
            html += '<div>';
            html += '<div class="h2h-summary-name">' + getPlayerName(h.opponent_id) + '</div>';
            html += '<div class="h2h-summary-record">' + h.wins + 'W – ' + h.ties + 'D – ' + h.losses + 'L • ' + total + ' sessions</div>';
            html += '</div>';
            html += '<div class="h2h-summary-bar">';
            html += '<div style="width:' + winPct + '%;background:#667eea;"></div>';
            html += '<div style="width:' + tiePct + '%;background:#aaa;"></div>';
            html += '<div style="width:' + lossPct + '%;background:#f5576c;"></div>';
            html += '</div>';
            html += '</div>';
        }
        html += '</div>';
    }

    // All sessions — scrollable and searchable
    if (data.recent_sessions && data.recent_sessions.length > 0) {
        html += '<div class="section-box section-box-green mt-20">';
        html += '<h3 class="section-heading-green">🎴 Sessions (' + data.recent_sessions.length + ')</h3>';
        html += '<input type="text" id="profileSessionSearch" placeholder="🔍 Search sessions..." style="margin-bottom:10px;" oninput="filterProfileSessions()">';
        html += '<div id="profileSessionList" class="profile-session-list">';
        for (let i = 0; i < data.recent_sessions.length; i++) {
            const s = data.recent_sessions[i];
            const cleanDate = formatUKDate(s.date);
            let eloHtml = '';
            if (s.elo_after !== null && s.elo_after !== undefined) {
                const eloChangeStr = s.elo_change >= 0 ? '+' + s.elo_change : String(s.elo_change);
                const eloChangeColor = s.elo_change > 0 ? '#4caf50' : s.elo_change < 0 ? '#f5576c' : '#888';
                eloHtml = ' <span class="elo-badge" style="font-size:0.72em;">⚡ ' + s.elo_after + '</span>' +
                          ' <span style="color:' + eloChangeColor + ';font-weight:600;font-size:0.78em;">(' + eloChangeStr + ')</span>';
            }
            html += '<div class="profile-session-row" data-title="' + escapeAttr(s.title) + '" onclick="viewSessionFromProfileWithLoading(this, \'' + s.session_id + '\')">';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div class="profile-session-title">' + s.title + '</div>';
            html += '<div class="profile-session-meta">' + cleanDate + ' • ' + s.hand_count + ' hands • ' + s.player_count + ' players • ' + s.player_score + ' pts' + eloHtml + '</div>';
            html += '</div>';
            html += '<div class="profile-session-result ' + (s.won ? 'won' : 'lost') + '">' + (s.won ? '🏆 Win' : 'Loss') + '</div>';
            html += '</div>';
        }
        html += '</div>';
        html += '</div>';
    }

    contentDiv.innerHTML = html;

    // Draw ELO chart after DOM update
    if (elo.history.length >= 2) {
        setTimeout(function() { drawProfileEloChart(elo.history); }, 100);
    }
}

function renderAchievements(achievements) {
    const ACHIEVEMENT_DEFS = [
        { key: 'apprentice',         emoji: '🎴',  name: 'Apprentice',         live: false, desc: '50 hands played' },
        { key: 'centurion',          emoji: '🏛️',  name: 'Centurion',          live: false, desc: '100 hands played' },
        { key: 'journeyman',         emoji: '⚔️',  name: 'Journeyman',         live: false, desc: '200 hands played' },
        { key: 'veteran',            emoji: '🛡️',  name: 'Veteran',            live: false, desc: '500 hands played' },
        { key: 'millennium',         emoji: '🌌',  name: 'Millennium',         live: false, desc: '1000 hands played' },
        { key: 'legend',             emoji: '👑',  name: 'Legend',             live: false, desc: '2000 hands played' },
        { key: 'first_blood',        emoji: '🏆',  name: 'First Blood',        live: false, desc: 'Win your first session' },
        { key: 'ruler',              emoji: '🥇',  name: 'Ruler',              live: false, desc: 'Win 10 sessions' },
        { key: 'dynasty',            emoji: '👑',  name: 'Dynasty',            live: false, desc: 'Win 25 sessions' },
        { key: 'conqueror',          emoji: '🌍',  name: 'Conqueror',          live: false, desc: 'Win 50 sessions' },
        { key: 'picking_the_lock',   emoji: '🔑',  name: 'Picking the Lock',   live: false, desc: '50 successful lockouts' },
        { key: 'the_locksmith',      emoji: '🔒',  name: 'The Locksmith',      live: false, desc: '100 successful lockouts' },
        { key: 'master_of_the_lock', emoji: '🗝️',  name: 'Master of the Lock', live: false, desc: '250 successful lockouts' },
        { key: 'grand_master',       emoji: '💀',  name: 'Grand Master',       live: false, desc: '500 successful lockouts' },
        { key: 'hat_trick',          emoji: '🔥',  name: 'Hat Trick',          live: false, desc: '3 successful lockouts in a single session' },
        { key: 'unstoppable',        emoji: '☄️',  name: 'Unstoppable',        live: false, desc: '5 successful lockouts in a single session' },
        { key: 'rock_bottom',        emoji: '📉',  name: 'Rock Bottom',        live: false, desc: 'Finish a session with a negative total score' },
        { key: 'the_hustler',        emoji: '🃏',  name: 'The Hustler',        live: false, desc: 'Win a session having joined as a late joiner' },
        { key: 'overconfident',      emoji: '😤',  name: 'Overconfident',      live: false, desc: '3 or more false lockouts where your score was over 5' },
        { key: 'the_strategist',     emoji: '🧠',  name: 'The Strategist',     live: false, desc: 'Win a session with the fewest lockout attempts of any player' },
        { key: 'high_roller',        emoji: '🎰',  name: 'High Roller',        live: false, desc: 'Attempt a lockout with a score of exactly 5, three or more times' },
        { key: 'bloodbath',          emoji: '🩸',  name: 'Bloodbath',          live: false, desc: 'Play a session where every player had at least one false lockout' },
        { key: 'slow_burner',        emoji: '🐢',  name: 'Slow Burner',        live: false, desc: 'Win a session without attempting a single lockout' },
        { key: 'perfect_hand',       emoji: '🎯',  name: 'Perfect Hand',       live: false, desc: 'Successfully lock out with a score of 0 or less' },
        { key: 'the_ghost',          emoji: '👻',  name: 'The Ghost',          live: false, desc: 'Play 5 sessions without ever attempting a lockout' },
        { key: 'lightning_round',    emoji: '⚡',  name: 'Lightning Round',    live: false, desc: 'Play a session that ends in under 10 hands' },
        { key: 'nemesis',            emoji: '🤝',  name: 'Nemesis',            live: false, desc: 'Beat the same player in 5 consecutive head-to-head sessions' },
        { key: 'marksman',           emoji: '🎯',  name: 'Marksman',           live: true,  desc: 'Avg LO ≤ 1.0 (25+ successful LOs)' },
        { key: 'surgeon',            emoji: '🔬',  name: 'Surgeon',            live: true,  desc: 'Avg LO ≤ 0.0 (25+ successful LOs)' },
        { key: 'ice_veins',          emoji: '🧊',  name: 'Ice Veins',          live: true,  desc: 'Avg LO ≤ -1.0 (25+ successful LOs)' },
        { key: 'consistent',         emoji: '📊',  name: 'Consistent',         live: true,  desc: 'Avg hand ≤ 6.0 (100+ hands)' },
        { key: 'efficient',          emoji: '📉',  name: 'Efficient',          live: true,  desc: 'Avg hand ≤ 4.5 (100+ hands)' },
        { key: 'machine',            emoji: '🤖',  name: 'Machine',            live: true,  desc: 'Avg hand ≤ 3.0 (100+ hands)' },
        { key: 'elo_climber',        emoji: '⚡',  name: 'ELO Climber',        live: true,  desc: 'Rating ≥ 1100' },
        { key: 'elo_elite',          emoji: '🚀',  name: 'ELO Elite',          live: true,  desc: 'Rating ≥ 1200' },
        { key: 'elo_master',         emoji: '💎',  name: 'ELO Master',         live: true,  desc: 'Rating ≥ 1300' }
    ];

    const permanent = ACHIEVEMENT_DEFS.filter(function(a) { return !a.live; });
    const live = ACHIEVEMENT_DEFS.filter(function(a) { return a.live; });

    let html = '<div class="achievements-section">';
    html += '<div class="section-box section-box-yellow">';
    html += '<h3 class="section-heading-yellow">🏅 Achievements</h3>';
    html += '<p class="text-muted text-sm mb-10">Permanent milestones — once earned, never lost. Tap any badge for details.</p>';
    html += '<div class="achievements-grid">';
    for (let i = 0; i < permanent.length; i++) {
        const a = permanent[i];
        const earned = achievements[a.key] ? true : false;
        html += '<div class="achievement-badge ' + (earned ? 'earned' : 'locked') + '" onclick="showAchievementInfo(\'' + a.key + '\')">';
        html += '<span class="achievement-emoji">' + a.emoji + '</span>';
        html += '<div class="achievement-name">' + a.name + '</div>';
        html += '</div>';
    }
    html += '</div>';

    html += '<h3 class="section-heading-yellow mt-20">📊 Current Form</h3>';
    html += '<p class="text-muted text-sm mb-10">Live badges — held only while you maintain the standard. <span style="color:var(--success);font-weight:600;">↕</span> = can change. Tap any badge for details.</p>';
    html += '<div class="achievements-grid">';
    for (let i = 0; i < live.length; i++) {
        const a = live[i];
        const earned = achievements[a.key] ? true : false;
        html += '<div class="achievement-badge live-badge ' + (earned ? 'earned' : 'locked') + '" onclick="showAchievementInfo(\'' + a.key + '\')">';
        if (earned) html += '<span class="achievement-live-indicator">↕</span>';
        html += '<span class="achievement-emoji">' + a.emoji + '</span>';
        html += '<div class="achievement-name">' + a.name + '</div>';
        html += '</div>';
    }
    html += '</div>';
    html += '</div></div>';
    return html;
}

function showAchievementInfo(key) {
    const existing = document.getElementById('achievementPopup');
    if (existing) existing.remove();

    const ALL_ACHIEVEMENTS = {
        apprentice:         { emoji: '🎴',  name: 'Apprentice',         live: false, desc: '50 hands played' },
        centurion:          { emoji: '🏛️',  name: 'Centurion',          live: false, desc: '100 hands played' },
        journeyman:         { emoji: '⚔️',  name: 'Journeyman',         live: false, desc: '200 hands played' },
        veteran:            { emoji: '🛡️',  name: 'Veteran',            live: false, desc: '500 hands played' },
        millennium:         { emoji: '🌌',  name: 'Millennium',         live: false, desc: '1000 hands played' },
        legend:             { emoji: '👑',  name: 'Legend',             live: false, desc: '2000 hands played' },
        first_blood:        { emoji: '🏆',  name: 'First Blood',        live: false, desc: 'Win your first session' },
        ruler:              { emoji: '🥇',  name: 'Ruler',              live: false, desc: 'Win 10 sessions' },
        dynasty:            { emoji: '👑',  name: 'Dynasty',            live: false, desc: 'Win 25 sessions' },
        conqueror:          { emoji: '🌍',  name: 'Conqueror',          live: false, desc: 'Win 50 sessions' },
        picking_the_lock:   { emoji: '🔑',  name: 'Picking the Lock',   live: false, desc: '50 successful lockouts' },
        the_locksmith:      { emoji: '🔒',  name: 'The Locksmith',      live: false, desc: '100 successful lockouts' },
        master_of_the_lock: { emoji: '🗝️',  name: 'Master of the Lock', live: false, desc: '250 successful lockouts' },
        grand_master:       { emoji: '💀',  name: 'Grand Master',       live: false, desc: '500 successful lockouts' },
        hat_trick:          { emoji: '🔥',  name: 'Hat Trick',          live: false, desc: '3 successful lockouts in a single session' },
        unstoppable:        { emoji: '☄️',  name: 'Unstoppable',        live: false, desc: '5 successful lockouts in a single session' },
        rock_bottom:        { emoji: '📉',  name: 'Rock Bottom',        live: false, desc: 'Finish a session with a negative total score' },
        the_hustler:        { emoji: '🃏',  name: 'The Hustler',        live: false, desc: 'Win a session having joined as a late joiner' },
        overconfident:      { emoji: '😤',  name: 'Overconfident',      live: false, desc: '3 or more false lockouts where your score was over 5' },
        the_strategist:     { emoji: '🧠',  name: 'The Strategist',     live: false, desc: 'Win a session with the fewest lockout attempts of any player' },
        high_roller:        { emoji: '🎰',  name: 'High Roller',        live: false, desc: 'Attempt a lockout with a score of exactly 5, three or more times' },
        bloodbath:          { emoji: '🩸',  name: 'Bloodbath',          live: false, desc: 'Play a session where every player had at least one false lockout' },
        slow_burner:        { emoji: '🐢',  name: 'Slow Burner',        live: false, desc: 'Win a session without attempting a single lockout' },
        perfect_hand:       { emoji: '🎯',  name: 'Perfect Hand',       live: false, desc: 'Successfully lock out with a score of 0 or less' },
        the_ghost:          { emoji: '👻',  name: 'The Ghost',          live: false, desc: 'Play 5 sessions without ever attempting a lockout' },
        lightning_round:    { emoji: '⚡',  name: 'Lightning Round',    live: false, desc: 'Play a session that ends in under 10 hands' },
        nemesis:            { emoji: '🤝',  name: 'Nemesis',            live: false, desc: 'Beat the same player in 5 consecutive head-to-head sessions' },
        marksman:           { emoji: '🎯',  name: 'Marksman',           live: true,  desc: 'Average lockout score of 1.0 or under (minimum 25 successful lockouts)' },
        surgeon:            { emoji: '🔬',  name: 'Surgeon',            live: true,  desc: 'Average lockout score of 0.0 or under (minimum 25 successful lockouts)' },
        ice_veins:          { emoji: '🧊',  name: 'Ice Veins',          live: true,  desc: 'Average lockout score of -1.0 or under (minimum 25 successful lockouts)' },
        consistent:         { emoji: '📊',  name: 'Consistent',         live: true,  desc: 'Average hand score of 6.0 or under (minimum 100 hands)' },
        efficient:          { emoji: '📉',  name: 'Efficient',          live: true,  desc: 'Average hand score of 4.5 or under (minimum 100 hands)' },
        machine:            { emoji: '🤖',  name: 'Machine',            live: true,  desc: 'Average hand score of 3.0 or under (minimum 100 hands)' },
        elo_climber:        { emoji: '⚡',  name: 'ELO Climber',        live: true,  desc: 'Reach an ELO rating of 1100 or above' },
        elo_elite:          { emoji: '🚀',  name: 'ELO Elite',          live: true,  desc: 'Reach an ELO rating of 1200 or above' },
        elo_master:         { emoji: '💎',  name: 'ELO Master',         live: true,  desc: 'Reach an ELO rating of 1300 or above' }
    };

    const def = ALL_ACHIEVEMENTS[key];
    if (!def) return;

    const earned = _currentProfileData && _currentProfileData.achievements
        ? !!_currentProfileData.achievements[key]
        : false;

    const statusText = earned
        ? (def.live ? '<span style="color:var(--success);font-weight:600;">✅ Currently held</span>'
                    : '<span style="color:var(--success);font-weight:600;">✅ Earned</span>')
        : (def.live ? '<span style="color:#999;">Not currently held</span>'
                    : '<span style="color:#999;">Not yet earned</span>');

    const liveNote = def.live
        ? '<p style="font-size:0.8em;color:#888;margin-top:8px;font-style:italic;">↕ Live badge — can be gained or lost as your stats change</p>'
        : '<p style="font-size:0.8em;color:#888;margin-top:8px;font-style:italic;">🏅 Permanent — once earned, never lost</p>';

    const popup = document.createElement('div');
    popup.id = 'achievementPopup';
    popup.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:10000;display:flex;align-items:center;justify-content:center;padding:20px;';
    popup.innerHTML =
        '<div style="background:white;border-radius:16px;padding:30px;max-width:320px;width:100%;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,0.3);">' +
            '<div style="font-size:3em;margin-bottom:10px;">' + def.emoji + '</div>' +
            '<h3 style="color:var(--primary);margin-bottom:8px;">' + def.name + '</h3>' +
            '<p style="color:var(--text-dark);font-size:0.95em;margin-bottom:12px;">' + def.desc + '</p>' +
            statusText + liveNote +
            '<button class="btn btn-secondary mt-20" onclick="document.getElementById(\'achievementPopup\').remove()">Close</button>' +
        '</div>';

    popup.addEventListener('click', function(e) { if (e.target === popup) popup.remove(); });
    document.body.appendChild(popup);
    hapticFeedback('light');
}

function drawProfileEloChart(history) {
    const ctx = document.getElementById('profileEloCanvas');
    if (!ctx) return;
    const labels = history.map(function(e, i) { return 'S' + (i + 1); });
    const dataPoints = [Number(history[0].old_rating)];
    for (let i = 0; i < history.length; i++) dataPoints.push(Number(history[i].new_rating));
    labels.unshift('Start');
    if (window._profileEloChart) window._profileEloChart.destroy();
    window._profileEloChart = new Chart(ctx.getContext('2d'), {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: dataPoints,
                borderColor: '#667eea',
                backgroundColor: 'rgba(102,126,234,0.1)',
                borderWidth: 2,
                tension: 0.1,
                pointRadius: 3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { title: { display: true, text: 'Rating' } },
                x: { ticks: { font: { size: 10 } } }
            }
        }
    });
}

async function handleEditProfileClick() {
    if (!_currentProfileData) return;
    const playerId = _currentProfileData.player.player_id;
    const identity = getStoredIdentity();
    const alreadyVerified = identity &&
        String(identity.player_id) === String(playerId) &&
        Boolean(getProfileToken(playerId));

    // Show loading state on the button
    const editBtn = document.querySelector('.profile-edit-btn');
    if (editBtn) {
        editBtn.textContent = '⏳ Loading...';
        editBtn.style.opacity = '0.6';
        editBtn.style.pointerEvents = 'none';
    }

    const restoreBtn = function() {
        if (editBtn) {
            editBtn.textContent = '✏️ Edit Profile';
            editBtn.style.opacity = '';
            editBtn.style.pointerEvents = '';
        }
    };

    const check = await apiCall('checkPlayerPin', { player_id: playerId });

    if (check.error) {
        restoreBtn();
        alert('Could not check PIN status. Please try again.');
        return;
    }
    if (!check.has_pin) {
        clearIdentity();
        restoreBtn();
        openPinSetupModal(playerId);
        return;
    }
    if (alreadyVerified) {
        restoreBtn();
        openEditProfileModal(playerId);
        return;
    }
    restoreBtn();
    openPinEntryModal(playerId, function() {
        openEditProfileModal(playerId);
    });
}

function openEditProfileModal(playerId) {
    if (!_currentProfileData) return;
    document.getElementById('profileBioInput').value = decodeHtml(_currentProfileData.player.bio || '');
    window._pendingPhotoUrl = _currentProfileData.player.avatar_url || '';
    window._photoUploadContext = { scope: 'profile', player_id: playerId };
    document.getElementById('profilePhotoUpload').innerHTML = createPhotoUploadUI(_currentProfileData.player.avatar_url || '', null);
    document.getElementById('editProfileMessage').innerHTML = '';
    document.getElementById('editProfileModal').classList.add('active');
}

function closeEditProfileModal() {
    document.getElementById('editProfileModal').classList.remove('active');
    document.getElementById('editProfileMessage').innerHTML = '';
}

async function saveProfileEdits(event) {
    const intentId = beginNavigationIntent();
    const saveBtn = event.target;
    setButtonLoading(saveBtn, true);
    const bio = document.getElementById('profileBioInput').value.trim();
    const avatarUrl = window._pendingPhotoUrl !== undefined ? window._pendingPhotoUrl : (_currentProfileData.player.avatar_url || '');
    const messageDiv = document.getElementById('editProfileMessage');
    const data = await apiCall('updatePlayerProfile', {
        player_id: _currentProfileData.player.player_id,
        avatar_url: avatarUrl,
        bio: bio
    });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">❌ Could not save profile. Please try again.</div>';
        setButtonLoading(saveBtn, false);
    } else {
        messageDiv.innerHTML = '<div class="success">✅ Profile updated!</div>';
        hapticFeedback('success');
        // Refresh player cache
        playersLoaded = false;
        await ensurePlayersLoaded();
        setTimeout(function() {
            if (!isCurrentNavigationIntent(intentId)) {
                setButtonLoading(saveBtn, false);
                return;
            }
            closeEditProfileModal();
            showPlayerProfile(_currentProfileData.player.player_id, intentId);
            setButtonLoading(saveBtn, false);
        }, 1000);
    }
}

async function viewSessionFromProfile(sessionId) {
    const intentId = beginNavigationIntent();
    if (allSessions.length === 0) await loadPreviousSessions(intentId);
    if (!isCurrentNavigationIntent(intentId)) return;
    const sessionIndex = allSessions.findIndex(s => String(s.session_id) === String(sessionId));
    if (sessionIndex !== -1) {
        document.getElementById('profileBackBtn').onclick = function() {
            showScreen('playerProfileScreen');
        };
        viewSessionDetail(sessionIndex, null, intentId);
    }
}

async function viewSessionFromProfileWithLoading(rowElement, sessionId) {
    const intentId = beginNavigationIntent();
    // Disable all rows and show loading on the tapped row
    const allRows = document.querySelectorAll('#profileSessionList .profile-session-row');
    for (let i = 0; i < allRows.length; i++) {
        allRows[i].style.pointerEvents = 'none';
        allRows[i].style.opacity = '0.4';
    }
    rowElement.style.opacity = '1';
    rowElement.style.background = '#e8e9ff';
    rowElement.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 0;width:100%;">' +
            '<span style="font-size:1.1em;">⏳</span>' +
            '<span style="color:var(--primary);font-weight:600;font-size:0.9em;">Loading session...</span>' +
        '</div>';

    if (allSessions.length === 0) await loadPreviousSessions(intentId);
    if (!isCurrentNavigationIntent(intentId)) return;
    const sessionIndex = allSessions.findIndex(s => String(s.session_id) === String(sessionId));

    if (sessionIndex !== -1) {
        document.getElementById('profileBackBtn').onclick = function() {
            showScreen('playerProfileScreen');
        };
        viewSessionDetail(sessionIndex, null, intentId);
    } else {
        // Restore all rows if not found
        for (let i = 0; i < allRows.length; i++) {
            allRows[i].style.pointerEvents = '';
            allRows[i].style.opacity = '';
            allRows[i].style.background = '';
        }
        alert('Session not found. Try viewing Previous Sessions first.');
    }
}

function filterProfileSessions() {
    const search = document.getElementById('profileSessionSearch');
    if (!search) return;
    const term = search.value.toLowerCase();
    const rows = document.querySelectorAll('#profileSessionList .profile-session-row');
    for (let i = 0; i < rows.length; i++) {
        const title = (rows[i].dataset.title || '').toLowerCase();
        const text = rows[i].textContent.toLowerCase();
        rows[i].style.display = (title.includes(term) || text.includes(term)) ? '' : 'none';
    }
}

// ============================================
// FEEDBACK
// ============================================
function showFeedbackModal() {
    document.getElementById('feedbackText').value = '';
    document.getElementById('feedbackName').value = '';
    document.getElementById('feedbackType').value = 'Bug';
    document.getElementById('feedbackMessage').innerHTML = '';
    document.getElementById('feedbackModal').classList.add('active');
    hapticFeedback('light');
}

function closeFeedbackModal() {
    document.getElementById('feedbackModal').classList.remove('active');
    document.getElementById('feedbackMessage').innerHTML = '';
}

async function submitFeedback(event) {
    const type = document.getElementById('feedbackType').value;
    const text = document.getElementById('feedbackText').value.trim();
    const name = document.getElementById('feedbackName').value.trim();
    const messageDiv = document.getElementById('feedbackMessage');
    const submitBtn = event.target;

    if (!text) {
        messageDiv.innerHTML = '<div class="error">Please enter a message before sending.</div>';
        return;
    }

    setButtonLoading(submitBtn, true);
    const data = await apiCall('submitFeedback', {
        type: type,
        message: text,
        submitted_by: name || 'Anonymous'
    });

    if (data.error) {
        messageDiv.innerHTML = '<div class="error">❌ Could not send feedback. Please try again.</div>';
        setButtonLoading(submitBtn, false);
    } else {
        messageDiv.innerHTML = '<div class="success">✅ Thanks! Your feedback has been sent.</div>';
        hapticFeedback('success');
        setTimeout(function() { closeFeedbackModal(); setButtonLoading(submitBtn, false); }, 1500);
    }
}

// ============================================
// SESSION SEARCH FILTER
// ============================================
function filterSessions() {
    const searchTerm = document.getElementById('sessionSearchInput').value.toLowerCase();
    const sessionItems = document.querySelectorAll('.session-item');
    for (let i = 0; i < sessionItems.length; i++) {
        const item = sessionItems[i];
        item.style.display = item.textContent.toLowerCase().indexOf(searchTerm) !== -1 ? 'block' : 'none';
    }
}

// ============================================
// SORTABLE STATS TABLE
// ============================================
let currentSortColumn = -1, currentSortAscending = true;

function sortStatsTable(columnIndex) {
    const table = document.getElementById('playerBreakdownTable');
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    if (currentSortColumn === columnIndex) { currentSortAscending = !currentSortAscending; } else { currentSortAscending = true; currentSortColumn = columnIndex; }
    rows.sort(function(a, b) {
        const aCell = a.cells[columnIndex].textContent.trim(), bCell = b.cells[columnIndex].textContent.trim();
        const aNum = parseFloat(aCell.replace('%', '')), bNum = parseFloat(bCell.replace('%', ''));
        let comparison = (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : aCell.localeCompare(bCell);
        return currentSortAscending ? comparison : -comparison;
    });
    for (let i = 0; i < rows.length; i++) table.appendChild(rows[i]);
    const headers = table.querySelectorAll('th');
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const text = header.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ⇅', '');
        if (i === columnIndex) { header.textContent = text + (currentSortAscending ? ' ↑' : ' ↓'); header.style.color = 'white'; header.style.backgroundColor = '#5568d3'; header.style.fontWeight = 'bold'; }
        else { header.textContent = text + ' ⇅'; header.style.color = 'white'; header.style.backgroundColor = '#667eea'; header.style.fontWeight = '600'; }
    }
    hapticFeedback('light');
}

// ============================================
// SORTABLE SESSION DETAIL TABLE
// ============================================
let currentSessionSortColumn = -1, currentSessionSortAscending = true;

function sortSessionTable(columnIndex) {
    const table = document.getElementById('sessionDetailTable');
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    if (currentSessionSortColumn === columnIndex) { currentSessionSortAscending = !currentSessionSortAscending; } else { currentSessionSortAscending = true; currentSessionSortColumn = columnIndex; }
    rows.sort(function(a, b) {
        const aCell = a.cells[columnIndex].textContent.trim(), bCell = b.cells[columnIndex].textContent.trim();
        const aNum = parseFloat(aCell.replace('%', '')), bNum = parseFloat(bCell.replace('%', ''));
        let comparison = (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : aCell.localeCompare(bCell);
        return currentSortAscending ? comparison : -comparison;
    });
    for (let i = 0; i < rows.length; i++) table.appendChild(rows[i]);
    const headers = table.querySelectorAll('th');
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const text = header.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ⇅', '');
        if (i === columnIndex) { header.textContent = text + (currentSessionSortAscending ? ' ↑' : ' ↓'); header.style.color = 'white'; header.style.backgroundColor = '#5568d3'; header.style.fontWeight = 'bold'; }
        else { header.textContent = text + ' ⇅'; header.style.color = 'white'; header.style.backgroundColor = '#667eea'; header.style.fontWeight = '600'; }
    }
    hapticFeedback('light');
}

// ============================================
// SORTABLE ACTIVE SESSION TABLE
// ============================================
let currentActiveSortColumn = -1, currentActiveSortAscending = true;

function sortActiveSessionTable(columnIndex) {
    const table = document.getElementById('activeSessionTable');
    if (!table) return;
    const rows = Array.from(table.querySelectorAll('tr')).slice(1);
    if (currentActiveSortColumn === columnIndex) { currentActiveSortAscending = !currentActiveSortAscending; } else { currentActiveSortAscending = true; currentActiveSortColumn = columnIndex; }
    rows.sort(function(a, b) {
        const aCell = a.cells[columnIndex].textContent.trim(), bCell = b.cells[columnIndex].textContent.trim();
        const aNum = parseFloat(aCell.replace('%', '')), bNum = parseFloat(bCell.replace('%', ''));
        let comparison = (!isNaN(aNum) && !isNaN(bNum)) ? aNum - bNum : aCell.localeCompare(bCell);
        return currentActiveSortAscending ? comparison : -comparison;
    });
    for (let i = 0; i < rows.length; i++) table.appendChild(rows[i]);
    const headers = table.querySelectorAll('th');
    for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        const text = header.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ⇅', '');
        if (i === columnIndex) { header.textContent = text + (currentActiveSortAscending ? ' ↑' : ' ↓'); header.style.color = 'white'; header.style.backgroundColor = '#5568d3'; header.style.fontWeight = 'bold'; }
        else { header.textContent = text + ' ⇅'; header.style.color = 'white'; header.style.backgroundColor = '#667eea'; header.style.fontWeight = '600'; }
    }
    hapticFeedback('light');
}
