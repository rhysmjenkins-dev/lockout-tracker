// ============================================
// CONFIGURATION & STATE
// ============================================
const API_URL = 'https://script.google.com/macros/s/AKfycbzcbiMfkq6D6PcySY2O-80NTHHmQplU0xzi1kzQG8OFuAYuw0F-YdI2IONkA3DVOhlH/exec';

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
async function apiCall(action, params) {
    const url = new URL(API_URL);
    url.searchParams.append('action', action);
    for (let key in params) {
        url.searchParams.append(key, params[key]);
    }
    try {
        const response = await fetch(url);
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('API Error:', error);
        return { error: error.message };
    }
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
    showScreen('appInstructionsScreen');
    setTimeout(function() {
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

async function showEloStats() {
    const contentDiv = document.getElementById('statsContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-50 mb-10" style="height:22px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-80 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-60 mb-10" style="height:36px;"></div>' +
            '<div class="shimmer-wrapper skeleton-text skeleton-w-80 mb-10" style="height:36px;"></div>' +
        '</div>';
    await loadEloRatings();
    if (eloCache.length === 0) {
        contentDiv.innerHTML = '<div class="error">No ELO data found.</div>';
        return;
    }
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
    html += '<div id="eloChartShimmer" class="skeleton-card">' +
                '<div class="shimmer-wrapper skeleton-text skeleton-w-60 mb-10" style="height:20px;"></div>' +
                '<div class="shimmer-wrapper" style="height:250px; border-radius:8px;"></div>' +
            '</div>';
    html += '<div class="elo-chart-container" id="eloChartContainer" style="display:none;"><canvas id="eloHistoryChart"></canvas></div>';
    html += '</div>';
    
    setTimeout(drawEloHistoryChart, 100);
}

async function drawEloHistoryChart() {
    const shimmer = document.getElementById('eloChartShimmer');
    const container = document.getElementById('eloChartContainer');
    const ctx = document.getElementById('eloHistoryChart');
    if (!ctx) return;
    const colors = CHART_COLORS;

    // Fetch sessions and all player histories in parallel
    const [sessionsData, ...allHistories] = await Promise.all([
        apiCall('getSessionsWithHands', {}),
        ...eloCache.map(p => apiCall('getEloHistory', { player_id: p.player_id }))
    ]);

    const completedSessions = sessionsData
        .filter(s => s.session.date_ended && s.session.date_ended !== '')
        .filter(s => !String(s.session.tags || '').toLowerCase().includes('testing'))
        .sort((a, b) => new Date(a.session.date_started) - new Date(b.session.date_started));

    if (completedSessions.length === 0) return;

    const labels = ['Start', ...completedSessions.map(s => s.session.title)];
    const datasets = [];

    for (let i = 0; i < eloCache.length; i++) {
        const p = eloCache[i];
        const history = allHistories[i];
        if (history.error) continue;

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

    if (shimmer) shimmer.style.display = 'none';
    if (container) container.style.display = 'block';

    const isMobile = window.innerWidth < 600;
    const shortLabels = labels.map(l => l.length > 8 ? l.substring(0, 8) + '…' : l);

    new Chart(ctx.getContext('2d'), {
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
    if (playerCache[playerId]) return playerCache[playerId];
    for (let i = 0; i < allPlayers.length; i++) {
        if (allPlayers[i].player_id == playerId) return allPlayers[i].username;
    }
    return 'Unknown';
}

function escapeAttr(str) {
    return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
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
// IMAGE UPLOAD (ImgBB)
// ============================================
const IMGBB_API_KEY = '2b796b5794b765667ae8e38fcbce309d';

async function uploadToImgur(file) {
    const formData = new FormData();
    formData.append('image', file);
    try {
        const response = await fetch('https://api.imgbb.com/1/upload?key=' + IMGBB_API_KEY, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (data.success) return { url: data.data.url };
        return { error: 'Upload failed' };
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
    overlay.innerHTML = '<img src="' + url + '" style="max-width:95%;max-height:95%;border-radius:8px;object-fit:contain;">';
    overlay.onclick = function() { document.body.removeChild(overlay); };
    document.body.appendChild(overlay);
}

// ============================================
// SCREEN NAVIGATION
// ============================================
function showScreen(screenId, skipHistory) {
    const screens = document.querySelectorAll('.screen');
    const currentScreen = document.querySelector('.screen.active');
    if (currentScreen) {
        currentScreen.style.opacity = '0';
        currentScreen.style.transform = 'translateY(-10px)';
    }
    window.scrollTo(0, 0);
    setTimeout(function() {
        for (let i = 0; i < screens.length; i++) {
            screens[i].classList.remove('active');
            screens[i].style.opacity = '';
            screens[i].style.transform = '';
        }
        document.getElementById(screenId).classList.add('active');
        window.scrollTo(0, 0);
    }, 150);
    if (!skipHistory) history.pushState({ screen: screenId }, '', '#' + screenId);
    if (screenId === 'startSessionScreen') setTimeout(function() { loadPlayersForSession(); }, 150);
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
    document.getElementById('createSessionPhotoUpload').innerHTML = createPhotoUploadUI('', null);
}

async function addPlayer() {
    const username = document.getElementById('newPlayerName').value.trim();
    const messageDiv = document.getElementById('addPlayerMessage');
    if (!username) { messageDiv.innerHTML = '<div class="error">Please enter a player name</div>'; return; }
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
        setTimeout(function() { showScreen('homeScreen'); setButtonLoading(addBtn, false); }, 1500);
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
    document.getElementById('addPlayerMessage').innerHTML = '';
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
    const messageDiv = document.getElementById('addPlayerMessage');
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
    document.getElementById('addPlayerMessage').innerHTML = '';
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
    if (activeSessions.length > 0) {
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

            for (let p = 0; p < playerIds.length; p++) {
                const pid = playerIds[p];
                playerScores[pid] = 0;
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
            html += '<button class="btn btn-success btn-small active-session-resume-btn" onclick="resumeSession(' + session.session_id + ', this)">Resume</button>';
            html += '</div>';
            html += '<div class="active-session-stat-grid">';
            html += '<div class="active-session-stat-cell"><div class="active-session-stat-label">🎴 HAND</div><div class="active-session-stat-value">' + handCount + '</div></div>';
            html += '<div class="active-session-stat-cell"><div class="active-session-stat-label">👥 PLAYERS</div><div class="active-session-stat-value">' + playerIds.length + '</div></div>';
            html += '</div>';

            if (leaderId) {
                html += '<div class="active-session-leader-box">';
                html += '<div class="active-session-leader-name">🏆 ' + getPlayerName(leaderId) + ' leading</div>';
                html += '<div class="active-session-leader-score">' + playerScores[leaderId] + ' points</div>';
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
    } else {
        document.getElementById('activeSessionsSection').innerHTML = '';
    }
}

async function createSession() {
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
        messageDiv.innerHTML = '<div class="error">⚠️ A session named "' + title + '" already exists.</div>';
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
        currentSession = {
            session_id: data.session_id, title: title, host_player_id: hostId,
            notes: notes, tags: tags, player_join_info: '{}',
            players_involved: selectedPlayers.join(','), false_lockout_penalty: penalty,
            photo_url: ''
        };
        if (window._pendingPhotoUrl) {
            await apiCall('updateSessionPhoto', {
                session_id: data.session_id,
                photo_url: window._pendingPhotoUrl,
                editor_name: hostId
            });
            currentSession.photo_url = window._pendingPhotoUrl;
            window._pendingPhotoUrl = '';
        }
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

async function resumeSession(sessionId, buttonElement) {
    if (buttonElement) setButtonLoading(buttonElement, true);
    const sessionData = await apiCall('getSession', { session_id: sessionId });
    if (sessionData.error) {
        alert('Error loading session: ' + sessionData.error);
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    await ensurePlayersLoaded();
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
        false_lockout_penalty: sessionData.false_lockout_penalty || 10
    };
    const handsData = await apiCall('getHands', { session_id: sessionId });
    currentHandNumber = (handsData.error || handsData.length === 0) ? 1 : Math.max(...handsData.map(h => h.hand_number)) + 1;
    showActiveSession();
    updateSessionScores();
    if (buttonElement) setButtonLoading(buttonElement, false);
}

function showActiveSession() {
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
    showScreen('activeSessionScreen');
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
    container.innerHTML = html;
}

function showEditSessionModal() {
    document.getElementById('editSessionNotes').value = currentSession.notes || '';
    window._pendingPhotoUrl = currentSession.photo_url || '';
    document.getElementById('editSessionPhotoUpload').innerHTML = createPhotoUploadUI(currentSession.photo_url || '', null);
    const tagsSelect = document.getElementById('editSessionTags');
    const currentTags = (currentSession.tags || '').split(',').filter(t => t.trim());
    for (let i = 0; i < tagsSelect.options.length; i++) {
        tagsSelect.options[i].selected = currentTags.indexOf(tagsSelect.options[i].value) !== -1;
    }
    document.getElementById('editSessionModal').classList.add('active');
}

async function saveEditedSession() {
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
        currentSession.notes = notes;
        currentSession.tags = tags;
        if (window._pendingPhotoUrl !== undefined) {
            await apiCall('updateSessionPhoto', {
                session_id: currentSession.session_id,
                photo_url: window._pendingPhotoUrl,
                editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
            });
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

async function endSession() {
    if (!confirm('End this session?')) return;
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
    const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
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
    showScreen('homeScreen');
    checkActiveSessions();
    setTimeout(function() {
        eloCache = [];
        displayEloLeaderboard();
    }, 3000);
    setTimeout(function() {
        const popup = document.getElementById('sessionEndPopup');
        document.getElementById('sessionEndTitle').textContent = isTie ? 'Tie game!' : winner.username + ' wins!';
        document.getElementById('sessionEndScore').textContent = winner.total + ' points';
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
                '<label>' + player.username + (joinHand > 1 ? ' <span class="late-join-badge">H' + joinHand + '</span>' : '') + '</label>' +
                '<input type="number" id="score_' + player.player_id + '" placeholder="Score" min="-2" oninput="checkLockoutValidity()">' +
                '<label style="display: flex; align-items: center; gap: 5px; margin: 0;"><input type="radio" name="lockout_player" value="' + player.player_id + '" onchange="checkLockoutValidity()"> Locked Out</label>' +
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
    let allScoresEntered = true;
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        const joinHand = getPlayerJoinHand(player.player_id);
        if (joinHand <= currentHandNumber) {
            const scoreInput = document.getElementById('score_' + player.player_id);
            const scoreVal = scoreInput.value.trim();
            if (scoreVal === '') { allScoresEntered = false; break; }
            scores.push({ player_id: player.player_id, score: parseFloat(scoreVal) });
        }
    }
    if (!allScoresEntered) { warningDiv.style.display = 'none'; return; }
    const lockoutPlayerScore = scores.find(s => String(s.player_id) === String(lockoutPlayerId)).score;
    const lowestScore = Math.min(...scores.map(s => s.score));
    const playersWithLowestScore = scores.filter(s => s.score === lowestScore);
    const hasStrictlyLowestScore = (lockoutPlayerScore === lowestScore && playersWithLowestScore.length === 1);
    const isFalseLockout = (lockoutPlayerScore > 5) || !hasStrictlyLowestScore;
    if (isFalseLockout) {
        let warningMessage = '<strong>⚠️ Warning:</strong> ';
        if (lockoutPlayerScore > 5) {
            warningMessage += getPlayerName(lockoutPlayerId) + ' has a score of ' + lockoutPlayerScore + ' (max allowed: 5). This will be marked as a <strong>FALSE LOCKOUT</strong>.';
        } else if (lockoutPlayerScore > lowestScore) {
            const lowestPlayers = playersWithLowestScore.map(s => getPlayerName(s.player_id)).join(', ');
            warningMessage += getPlayerName(lockoutPlayerId) + ' does NOT have the lowest score. ' + lowestPlayers + ' has the lowest (' + lowestScore + '). This will be marked as a <strong>FALSE LOCKOUT</strong>.';
        } else if (playersWithLowestScore.length > 1) {
            const tiedPlayers = playersWithLowestScore.map(s => getPlayerName(s.player_id)).join(', ');
            warningMessage += getPlayerName(lockoutPlayerId) + ' is TIED for lowest score with ' + tiedPlayers + '. This will be marked as a <strong>FALSE LOCKOUT</strong>.';
        }
        warningDiv.innerHTML = warningMessage;
        warningDiv.style.display = 'block';
        hapticFeedback('error');
    } else {
        warningDiv.style.display = 'none';
    }
}

async function submitHand() {
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
    const lockoutPlayerScore = scores.find(s => String(s.player_id) === String(lockoutPlayerId)).score;
    const lowestScore = Math.min(...scores.map(s => s.score));
    const playersWithLowestScore = scores.filter(s => s.score === lowestScore);
    const hasStrictlyLowestScore = (lockoutPlayerScore === lowestScore && playersWithLowestScore.length === 1);
    let falseLockout = (lockoutPlayerScore > 5) || !hasStrictlyLowestScore;
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
            html += '<label>' + player.username + '</label>';
            html += '<input type="number" id="edit_score_' + player.player_id + '" value="' + displayScore + '" placeholder="Score" min="-2" oninput="checkEditLockoutValidity()">';
            html += '<label style="display: flex; align-items: center; gap: 5px; margin: 0;"><input type="radio" name="edit_lockout_player" value="' + player.player_id + '" ' + (isLockout ? 'checked' : '') + ' onchange="checkEditLockoutValidity()"> Locked Out</label>';
            html += '</div>';
        }
    }
    document.getElementById('editHandInputs').innerHTML = html;
    document.getElementById('editHandComment').value = handComment;
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
    let allScoresEntered = true;
    for (let i = 0; i < sessionPlayers.length; i++) {
        const player = sessionPlayers[i];
        const joinHand = getPlayerJoinHand(player.player_id);
        if (joinHand <= currentEditingHand) {
            const scoreInput = document.getElementById('edit_score_' + player.player_id);
            const scoreVal = scoreInput.value.trim();
            if (scoreVal === '') { allScoresEntered = false; break; }
            scores.push({ player_id: player.player_id, score: parseFloat(scoreVal) });
        }
    }
    if (!allScoresEntered) { warningDiv.style.display = 'none'; return; }
    const lockoutPlayerScore = scores.find(s => String(s.player_id) === String(lockoutPlayerId)).score;
    const lowestScore = Math.min(...scores.map(s => s.score));
    const playersWithLowestScore = scores.filter(s => s.score === lowestScore);
    const hasStrictlyLowestScore = (lockoutPlayerScore === lowestScore && playersWithLowestScore.length === 1);
    const isFalseLockout = (lockoutPlayerScore > 5) || !hasStrictlyLowestScore;
    if (isFalseLockout) {
        let warningMessage = '<strong>⚠️ Warning:</strong> ';
        if (lockoutPlayerScore > 5) {
            warningMessage += getPlayerName(lockoutPlayerId) + ' has a score of ' + lockoutPlayerScore + ' (max allowed: 5). This will be marked as a <strong>FALSE LOCKOUT</strong>.';
        } else if (lockoutPlayerScore > lowestScore) {
            const lowestPlayers = playersWithLowestScore.map(s => getPlayerName(s.player_id)).join(', ');
            warningMessage += getPlayerName(lockoutPlayerId) + ' does NOT have the lowest score. ' + lowestPlayers + ' has the lowest (' + lowestScore + '). This will be marked as a <strong>FALSE LOCKOUT</strong>.';
        } else if (playersWithLowestScore.length > 1) {
            const tiedPlayers = playersWithLowestScore.map(s => getPlayerName(s.player_id)).join(', ');
            warningMessage += getPlayerName(lockoutPlayerId) + ' is TIED for lowest score with ' + tiedPlayers + '. This will be marked as a <strong>FALSE LOCKOUT</strong>.';
        }
        warningDiv.innerHTML = warningMessage;
        warningDiv.style.display = 'block';
        hapticFeedback('error');
    } else {
        warningDiv.style.display = 'none';
    }
}

async function saveEditedHand() {
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
    const lockoutPlayerScore = scores.find(s => String(s.player_id) === String(lockoutPlayerId)).score;
    const lowestScore = Math.min(...scores.map(s => s.score));
    const playersWithLowestScore = scores.filter(s => s.score === lowestScore);
    const hasStrictlyLowestScore = (lockoutPlayerScore === lowestScore && playersWithLowestScore.length === 1);
    let falseLockout = !hasStrictlyLowestScore;
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
        const avgHand = handsPlayed > 0 ? ((p.total - p.startingScore) / handsPlayed).toFixed(2) : '0';
        const lockoutRate = handsPlayed > 0 ? ((p.lockouts / handsPlayed) * 100).toFixed(1) : '0';
        const avgLockoutScore = p.lockoutScores.length > 0 ? (p.lockoutScores.reduce((sum, s) => sum + s, 0) / p.lockoutScores.length).toFixed(2) : 'N/A';
        const falseLockoutRate = p.totalLockouts > 0 ? ((p.falseLockouts / p.totalLockouts) * 100).toFixed(1) : '0';
        const avgFalseLockoutScore = p.falseLockoutScores.length > 0 ? (p.falseLockoutScores.reduce((sum, s) => sum + s, 0) / p.falseLockoutScores.length).toFixed(2) : 'N/A';
        html += '<tr>';
        html += '<td><strong>' + p.username + '</strong>' + (p.joinHand > 1 ? ' <span class="late-join-badge">H' + p.joinHand + '</span>' : '') + ' ' + formatEloBadge(sessionPlayers.find(sp => sp.username === p.username).player_id) + '</td>';
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
    new Chart(ctx.getContext('2d'), { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cricket Worm' }, legend: { display: true, position: 'top' } }, scales: { y: { title: { display: true, text: 'Cumulative Score' } } } } });
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
    new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Manhattan' }, legend: { display: true, position: 'top' } }, scales: { x: { title: { display: true, text: 'Hand Number' } }, y: { title: { display: true, text: 'Score' }, beginAtZero: true } } } });
}

// ============================================
// PREVIOUS SESSIONS & SESSION DETAIL
// ============================================
async function loadPreviousSessions() {
    const contentDiv = document.getElementById('previousSessionsContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-15">Loading previous sessions...</h3>' +
            '<div class="skeleton-session-item"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text small skeleton-w-50"></div></div>' +
            '<div class="skeleton-session-item"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text small skeleton-w-50"></div></div>' +
            '<div class="skeleton-session-item"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text small skeleton-w-50"></div></div>' +
        '</div>';

    await ensurePlayersLoaded();
    const sessionsWithHands = await apiCall('getSessionsWithHands', {});
    if (sessionsWithHands.error) { contentDiv.innerHTML = '<div class="error">Error loading sessions: ' + sessionsWithHands.error + '</div>'; return; }

    const completedSessions = [];
    for (let i = 0; i < sessionsWithHands.length; i++) {
        const item = sessionsWithHands[i];
        if (!item.session.notes) item.session.notes = '';
        if (!item.session.tags) item.session.tags = '';
        if (!item.session.player_join_info) item.session.player_join_info = '{}';
        if (item.session.date_ended && item.session.date_ended !== '') completedSessions.push({ session: item.session, hands: item.hands, index: i });
    }
    completedSessions.sort(function(a, b) { return new Date(b.session.date_started) - new Date(a.session.date_started); });

    allSessions = completedSessions.map(item => item.session);
    window.sessionsHandsCache = {};
    for (let i = 0; i < completedSessions.length; i++) window.sessionsHandsCache[completedSessions[i].session.session_id] = completedSessions[i].hands;

    if (completedSessions.length === 0) { contentDiv.innerHTML = '<div class="placeholder-content"><h3>No Completed Sessions</h3><p>Complete a session to see it here!</p></div>'; return; }

    const eloHistoryAll = await apiCall('getEloHistoryAll', {});
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
var dateObj = new Date(session.date_started);
        var cleanDate = String(dateObj.getDate()).padStart(2, '0') + '/' + String(dateObj.getMonth() + 1).padStart(2, '0') + '/' + dateObj.getFullYear();
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
        var winnerName = winnerId ? getPlayerName(winnerId) : 'Unknown';

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
            console.log({
    session: session.session_id,
    winner: winnerId,
    key: String(session.session_id) + '_' + String(winnerId),
    eloEntry: eloHistoryMap[String(session.session_id) + '_' + String(winnerId)]
});
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
}

async function viewSessionDetail(sessionIndex, buttonElement) {
    if (buttonElement) setButtonLoading(buttonElement, true);
    const session = allSessions[sessionIndex];
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
    for (let i = 0; i < sortedPlayers.length; i++) {
        const pid = sortedPlayers[i];
        const history = await apiCall('getEloHistory', { player_id: pid });
        if (!history.error) {
            for (let j = 0; j < history.length; j++) {
                if (String(history[j].session_id) === String(session.session_id)) {
                    sessionElo[pid] = {
                        new_rating: Math.round(Number(history[j].new_rating)),
                        change: Math.round(Number(history[j].change))
                    };
                    break;
                }
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
        const avgHand = handsPlayed > 0 ? (total / handsPlayed).toFixed(2) : '0';
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
    showScreen('sessionDetailScreen');
    setTimeout(function() { drawSessionWormChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session); drawSessionManhattanChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session); }, 100);
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
    new Chart(ctx.getContext('2d'), { type: 'line', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cricket Worm' }, legend: { display: true, position: 'top' } }, scales: { y: { title: { display: true, text: 'Cumulative Score' } } } } });
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
    new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Manhattan' }, legend: { display: true, position: 'top' } }, scales: { x: { title: { display: true, text: 'Hand Number' } }, y: { title: { display: true, text: 'Score' }, beginAtZero: true } } } });
}

// ============================================
// OVERALL STATS
// ============================================
async function loadStats() {
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
    const sessionsWithHands = await apiCall('getSessionsWithHands', {});
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
    displayOverallStats(stats, completedSessionsData.length);
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
    const contentDiv = document.getElementById('statsContent');
    contentDiv.innerHTML = '<div class="loading">Loading overall stats...</div>';
    await loadStats();
}

async function recalculateElo() {
    if (!confirm('Recalculate all ELO ratings from scratch? This may take a moment.')) return;
    const btn = event.target;
    setButtonLoading(btn, true);
    const data = await apiCall('recalculateAllElo', {});
    if (data.error) {
        alert('Error: ' + data.error);
    } else {
        eloCache = [];
        await displayEloLeaderboard();
        alert('✅ ELO recalculated! ' + data.sessions_processed + ' sessions processed.');
    }
    setButtonLoading(btn, false);
}

// ============================================
// HEAD-TO-HEAD STATS
// ============================================
async function showHeadToHeadList() {
    const contentDiv = document.getElementById('statsContent');
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-15">Loading head-to-head records...</h3>' +
            '<div class="h2h-matchup-card"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-100 skeleton-h-8 mb-10"></div><div class="shimmer-wrapper skeleton-button skeleton-h-40"></div></div>' +
            '<div class="h2h-matchup-card"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-100 skeleton-h-8 mb-10"></div><div class="shimmer-wrapper skeleton-button skeleton-h-40"></div></div>' +
            '<div class="h2h-matchup-card"><div class="shimmer-wrapper skeleton-text skeleton-w-70 mb-10"></div><div class="shimmer-wrapper skeleton-text skeleton-w-100 skeleton-h-8 mb-10"></div><div class="shimmer-wrapper skeleton-button skeleton-h-40"></div></div>' +
        '</div>';

    await ensurePlayersLoaded();
    const data = await apiCall('getHeadToHeadMatrix', {});
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

function quickCompare(p1Id, p2Id) {
    showPlayerComparisonUI();
    setTimeout(function() {
        document.getElementById('comparisonPlayer1').value = p1Id;
        document.getElementById('comparisonPlayer2').value = p2Id;
        showPlayerComparison();
    }, 100);
}

// ============================================
// PLAYER COMPARISON
// ============================================
async function showPlayerComparisonUI() {
    await ensurePlayersLoaded();
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
    setTimeout(function() { const btn = document.getElementById('comparePlayersBtn'); if (btn) btn.addEventListener('click', showPlayerComparison); }, 50);
}

async function showPlayerComparison() {
    await ensurePlayersLoaded();
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

    showScreen('statsScreen');
    const data = await apiCall('getPlayerComparisonDetailed', { player1_id: p1Id, player2_id: p2Id });
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
            var dateObj = new Date(s.date);
            var cleanDate = String(dateObj.getDate()).padStart(2, '0') + '/' + String(dateObj.getMonth() + 1).padStart(2, '0') + '/' + dateObj.getFullYear();

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
    if (section === 'lingo') {
        document.getElementById('lingoSection').style.display = 'block';
        document.getElementById('glossarySection').style.display = 'none';
    } else {
        document.getElementById('lingoSection').style.display = 'none';
        document.getElementById('glossarySection').style.display = 'block';
    }
if (targetId) {
    setTimeout(function() {
        var el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 300);
}
}

async function viewSessionDetailFromComparison(sessionId, buttonElement) {
    if (buttonElement) setButtonLoading(buttonElement, true);
    if (allSessions.length === 0) await loadPreviousSessions();
    const sessionIndex = allSessions.findIndex(s => String(s.session_id) === String(sessionId));
    if (sessionIndex !== -1) {
        viewSessionDetail(sessionIndex, buttonElement);
    } else {
        alert('Session not found');
        if (buttonElement) setButtonLoading(buttonElement, false);
    }
}

// ============================================
// INITIALIZATION
// ============================================
window.addEventListener('DOMContentLoaded', function() {
    console.log('Lockout Tracker v4.1 🚀');
    window.scrollTo(0, 0);

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
            if (headerTapCount < 7) showScreen('homeScreen');
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
        return currentSessionSortAscending ? comparison : -comparison;
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
