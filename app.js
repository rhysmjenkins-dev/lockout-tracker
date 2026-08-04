// ============================================
// CONFIGURATION & STATE
// ============================================
const API_URL = window.LOCKOUT_CONFIG && window.LOCKOUT_CONFIG.apiUrl
    ? window.LOCKOUT_CONFIG.apiUrl
    : 'PASTE_APPS_SCRIPT_EXEC_URL_HERE';
const CHART_LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
const CONFETTI_LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js';

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
const PUBLIC_SNAPSHOT_STORAGE_KEY = 'lockout_public_snapshot_2_1';
const PUBLIC_SNAPSHOT_DIRTY_KEY = 'lockout_public_snapshot_2_1_dirty';
const PROFILE_SNAPSHOT_PREFIX = 'lockout_player_profile_2_1_';
const PROFILE_SNAPSHOT_INDEX_KEY = 'lockout_player_profile_2_1_index';
const LEGACY_PUBLIC_SNAPSHOT_STORAGE_KEYS = [
    'lockout_public_snapshot_2_1_beta_8',
    'lockout_public_snapshot_2_1_beta_7'
];
const PUBLIC_SNAPSHOT_SCHEMA_VERSION = 2;
const PROFILE_SNAPSHOT_SCHEMA_VERSION = 2;
const PUBLIC_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const PROFILE_SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const PROFILE_BACKGROUND_REFRESH_MS = 15000;
const HOME_BACKGROUND_REFRESH_MS = 30000;
const API_REQUEST_TIMEOUT_MS = 24000;
const CLOSE_SESSION_TIMEOUT_MS = 60000;
const READ_HEDGE_DELAY_MS = 4500;
const SAFE_POST_HEDGE_DELAY_MS = 7000;
const ACTIVE_SESSION_REFRESH_MS = 30000;

let currentSession = null;
let currentHandNumber = 1;
let allPlayers = [];
let sessionPlayers = [];
let allSessions = [];
let currentEditingHand = null;
let selectedPlayerToAdd = null;
let playersLoaded = false;
let playersLoadedAt = 0;
let playerCache = {};
let eloCache = [];
let eloHistoryAllCache = null;
let eloHistoryAllCachedAt = 0;
let eloDropdownOpen = false;
let activePhotoOverlay = null;
let photoViewerHistoryActive = false;
let publicConfig = {
    version: window.LOCKOUT_CONFIG && window.LOCKOUT_CONFIG.version || '2.1.1',
    photos_enabled: false
};
let homeDashboardPromise = null;
let homeDashboardRefreshPromise = null;
let homeBackgroundRefreshTimer = null;
let activeSessionRefreshTimer = null;
let activeSessionRefreshPromise = null;
let publicSnapshotNeedsRefresh = false;
let navigationIntentId = 0;
let screenTransitionTimer = null;
const readResponseCache = new Map();
const readRequestInFlight = new Map();
let readCacheGeneration = 0;
const externalScriptPromises = new Map();
window.lockoutPerformance = window.lockoutPerformance || [];

const READ_CACHE_TTL = {
    getAppBootstrap: 120000,
    getHomeData: 60000,
    getPlayers: 60000,
    getSessions: 60000,
    getRecentSessions: 60000,
    getSessionsWithHands: 120000,
    getPreviousSessionsData: 120000,
    getEloStatsData: 120000,
    getSessionState: 5000,
    getHeadToHeadMatrix: 120000,
    getPlayerComparisonDetailed: 120000,
    getEloRatings: 30000,
    getEloHistory: 120000,
    getEloHistoryAll: 120000,
    getSession: 5000,
    getHands: 5000,
    getPlayerProfile: 30000,
    getStatsSummary: 120000,
    getPublicConfig: 300000
};

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
    'getEditHistory', 'getSessionsWithHands', 'getPreviousSessionsData',
    'getEloStatsData', 'getSessionState', 'getHeadToHeadMatrix',
    'getPlayerComparisonDetailed', 'getEloRatings', 'getEloHistory',
    'getEloHistoryAll', 'getPlayerProfile', 'checkPlayerPin', 'getPublicConfig',
    'getHomeData', 'getStatsSummary', 'getAppBootstrap'
]);
const SESSION_ACTIONS = new Set([
    'updateSession', 'updateSessionPhoto', 'addPlayerToSession', 'closeSession',
    'addHand', 'updateHand', 'deleteHand'
]);
const UNAUTHENTICATED_WRITE_ACTIONS = new Set(['setPlayerPin', 'verifyPlayerPin']);
const SAFE_POST_RETRY_ACTIONS = new Set(['verifyPlayerPin', 'addHand']);
const HEDGED_SAFE_POST_ACTIONS = new Set(['addHand']);
const HEDGED_READ_ACTIONS = new Set([
    'getHomeData', 'getPlayers', 'getSessions', 'getRecentSessions',
    'getSession', 'getHands', 'getEditHistory', 'getSessionsWithHands',
    'getPreviousSessionsData', 'getEloStatsData', 'getSessionState',
    'getHeadToHeadMatrix', 'getPlayerComparisonDetailed', 'getEloRatings',
    'getEloHistory', 'getEloHistoryAll', 'getPlayerProfile',
    'getStatsSummary', 'checkPlayerPin', 'getPublicConfig'
]);
const DATA_CHANGING_WRITE_ACTIONS = new Set([
    'setPlayerPin', 'addPlayer', 'createSession', 'updateSession',
    'updateSessionPhoto', 'addPlayerToSession', 'closeSession',
    'addHand', 'updateHand', 'deleteHand', 'updatePlayerProfile'
]);

function loadExternalScript(url, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    if (externalScriptPromises.has(url)) return externalScriptPromises.get(url);
    const promise = new Promise(function(resolve, reject) {
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.onload = function() { resolve(globalName ? window[globalName] : true); };
        script.onerror = function() {
            externalScriptPromises.delete(url);
            reject(new Error('Could not load a visual effect.'));
        };
        document.head.appendChild(script);
    });
    externalScriptPromises.set(url, promise);
    return promise;
}

function loadChartLibrary() {
    return loadExternalScript(CHART_LIBRARY_URL, 'Chart');
}

function loadConfettiLibrary() {
    return loadExternalScript(CONFETTI_LIBRARY_URL, 'confetti');
}

function recordApiTiming(action, startedAt, data) {
    const duration = Date.now() - startedAt;
    const entry = {
        action: action,
        duration_ms: duration,
        server_ms: data && Number(data.server_ms || 0),
        success: !(data && data.error),
        at: new Date().toISOString()
    };
    window.lockoutPerformance.push(entry);
    if (window.lockoutPerformance.length > 50) window.lockoutPerformance.shift();
    if (duration >= 1500) console.info('API timing ' + JSON.stringify(entry));
}

function installSearchableSelect(selectOrId, placeholder) {
    const select = typeof selectOrId === 'string' ? document.getElementById(selectOrId) : selectOrId;
    if (!select) return null;
    const searchId = select.id + 'Search';
    const resultsId = searchId + 'Results';
    const statusId = searchId + 'Status';
    let search = document.getElementById(searchId);
    let results = document.getElementById(resultsId);
    let status = document.getElementById(statusId);
    if (!search) {
        search = document.createElement('input');
        search.type = 'search';
        search.id = searchId;
        search.className = 'player-select-search';
        search.placeholder = placeholder || 'Search players…';
        search.setAttribute('aria-label', placeholder || 'Search players');
        search.setAttribute('autocomplete', 'off');
        search.setAttribute('aria-controls', resultsId);
        search.setAttribute('aria-expanded', 'false');
        select.parentNode.insertBefore(search, select);

        results = document.createElement('div');
        results.id = resultsId;
        results.className = 'player-search-results';
        results.setAttribute('role', 'listbox');
        results.setAttribute('aria-label', (placeholder || 'Search players') + ' results');
        select.parentNode.insertBefore(results, select);

        status = document.createElement('div');
        status.id = statusId;
        status.className = 'player-search-status';
        status.setAttribute('aria-live', 'polite');
        select.parentNode.insertBefore(status, select.nextSibling);

        search.addEventListener('focus', function() {
            filterPlayerSelect(select, search.value, status, results, true);
        });
        search.addEventListener('input', function() {
            filterPlayerSelect(select, search.value, status, results, true);
        });
        search.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closePlayerSearchResults(search, results);
                return;
            }
            if (event.key !== 'Enter' && event.key !== 'ArrowDown') return;
            const firstResult = results.querySelector('.player-search-result:not([hidden])');
            if (!firstResult) return;
            event.preventDefault();
            if (event.key === 'Enter') choosePlayerSearchResult(select, search, results, status, firstResult);
            else firstResult.focus();
        });
    }
    select.classList.add('searchable-player-native-select');
    results.innerHTML = '';
    Array.from(select.options).forEach(function(option, index) {
        if (index === 0 || !option.value) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'player-search-result';
        button.dataset.value = option.value;
        button.dataset.searchText = option.textContent.toLowerCase();
        button.textContent = option.textContent;
        button.setAttribute('role', 'option');
        button.setAttribute('aria-selected', String(String(select.value) === String(option.value)));
        button.addEventListener('click', function() {
            choosePlayerSearchResult(select, search, results, status, button);
        });
        button.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closePlayerSearchResults(search, results);
                search.focus();
            }
        });
        results.appendChild(button);
    });
    const selected = select.options[select.selectedIndex];
    search.value = selected && selected.value ? selected.textContent : '';
    filterPlayerSelect(select, search.value, status, results, false);
    return search;
}

function closePlayerSearchResults(search, results) {
    results.classList.remove('is-open');
    search.setAttribute('aria-expanded', 'false');
}

function choosePlayerSearchResult(select, search, results, status, button) {
    select.value = button.dataset.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    search.value = button.textContent;
    results.querySelectorAll('.player-search-result').forEach(function(result) {
        result.classList.toggle('is-selected', result === button);
        result.setAttribute('aria-selected', String(result === button));
    });
    status.textContent = 'Selected ' + button.textContent;
    closePlayerSearchResults(search, results);
}

function filterPlayerSelect(select, query, status, results, openResults) {
    const term = String(query || '').trim().toLowerCase();
    let visible = 0;
    results.querySelectorAll('.player-search-result').forEach(function(button) {
        const matches = !term || button.dataset.searchText.includes(term);
        button.hidden = !matches;
        button.style.display = matches ? 'block' : 'none';
        if (matches) visible++;
    });
    const selected = select.options[select.selectedIndex];
    const selectedText = selected && selected.value ? selected.textContent.toLowerCase() : '';
    if (term && selectedText && selectedText !== term) select.value = '';
    status.textContent = term
        ? (visible ? visible + ' player' + (visible === 1 ? '' : 's') + ' found' : 'No players found')
        : '';
    results.classList.toggle('is-open', Boolean(openResults));
    searchPlayerResultsExpanded(select, openResults);
}

function searchPlayerResultsExpanded(select, expanded) {
    const search = document.getElementById(select.id + 'Search');
    if (search) search.setAttribute('aria-expanded', String(Boolean(expanded)));
}

function installPlayerListSearch(listId, placeholder) {
    const list = document.getElementById(listId);
    if (!list) return;
    const searchId = listId + 'Search';
    const statusId = searchId + 'Status';
    let search = document.getElementById(searchId);
    let status = document.getElementById(statusId);
    if (!search) {
        search = document.createElement('input');
        search.type = 'search';
        search.id = searchId;
        search.className = 'player-select-search';
        search.placeholder = placeholder || 'Search players…';
        search.setAttribute('aria-label', placeholder || 'Search players');
        search.setAttribute('autocomplete', 'off');
        list.parentNode.insertBefore(search, list);

        status = document.createElement('div');
        status.id = statusId;
        status.className = 'player-search-status';
        status.setAttribute('aria-live', 'polite');
        list.parentNode.insertBefore(status, list);

        search.addEventListener('input', function() {
            filterPlayerList(list, search.value, status);
        });
    }
    search.value = '';
    filterPlayerList(list, '', status);
}

function filterPlayerList(list, query, status) {
    const term = String(query || '').trim().toLowerCase();
    let visible = 0;
    list.querySelectorAll('.player-item').forEach(function(item) {
        const matches = !term || item.textContent.toLowerCase().includes(term);
        item.hidden = !matches;
        item.style.display = matches ? 'flex' : 'none';
        if (matches) visible++;
    });
    status.textContent = term
        ? (visible ? visible + ' player' + (visible === 1 ? '' : 's') + ' found' : 'No players found')
        : '';
}

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

function getPlayerToken() {
    return localStorage.getItem('lockout_player_token') || '';
}

function setPlayerToken(token) {
    if (token) localStorage.setItem('lockout_player_token', token);
    else localStorage.removeItem('lockout_player_token');
    updateEditingStatus();
}

function editingDisplayName() {
    const identity = getStoredIdentity();
    return identity && identity.username ? identity.username : 'Friend';
}

let _signInCallback = null;
let _signInResolver = null;
let _pendingSignInResolver = null;
let _signInChecking = false;
let _signInAttemptId = 0;

function setSignInChecking(isChecking, statusText) {
    _signInChecking = isChecking;
    const button = document.getElementById('signInContinueButton');
    const message = document.getElementById('signInMessage');
    if (button) {
        button.disabled = isChecking;
        button.textContent = isChecking ? '⏳ Checking…' : 'Continue';
        if (isChecking) button.setAttribute('aria-busy', 'true');
        else button.removeAttribute('aria-busy');
    }
    if (message && statusText) {
        message.innerHTML =
            '<div class="pin-progress"><span class="loading-spinner" aria-hidden="true"></span><span>' +
            escapeHtml(statusText) + '</span></div>';
    }
}

function isRetryablePinStatusError(data) {
    return data && (data.code === 'NETWORK_TIMEOUT' || data.code === 'NETWORK_ERROR');
}

async function checkPlayerPinWithRetry(playerId, attemptId) {
    let check = await apiCall('checkPlayerPin', { player_id: playerId });
    if (!isRetryablePinStatusError(check) || attemptId !== _signInAttemptId) return check;
    setSignInChecking(true, 'The server is taking a moment — trying once more…');
    await new Promise(function(resolve) { setTimeout(resolve, 350); });
    if (attemptId !== _signInAttemptId) return { error: 'Sign-in cancelled.', code: 'CANCELLED' };
    check = await apiCall('checkPlayerPin', { player_id: playerId });
    return check;
}

async function signInToEdit(forcePrompt, preferredPlayerId, callback) {
    if (getPlayerToken() && !forcePrompt) return getPlayerToken();
    await ensurePlayersLoaded();
    return new Promise(function(resolve) {
        _signInResolver = resolve;
        _signInCallback = callback || null;
        const select = document.getElementById('signInPlayerSelect');
        select.innerHTML = '<option value="">Choose player...</option>' + allPlayers.map(function(player) {
            const selected = String(player.player_id) === String(preferredPlayerId || '') ? ' selected' : '';
            return '<option value="' + player.player_id + '"' + selected + '>' + escapeHtml(player.username) + '</option>';
        }).join('');
        const search = installSearchableSelect(select, 'Search players…');
        setSignInChecking(false);
        document.getElementById('signInMessage').innerHTML = '';
        document.getElementById('signInModal').classList.add('active');
        setTimeout(function() { (search || select).focus(); }, 0);
    });
}

function closeSignInModal() {
    _signInAttemptId++;
    setSignInChecking(false);
    document.getElementById('signInModal').classList.remove('active');
    _signInCallback = null;
    if (_signInResolver) _signInResolver('');
    _signInResolver = null;
}

async function continuePlayerSignIn() {
    if (_signInChecking) return;
    const playerId = document.getElementById('signInPlayerSelect').value;
    const message = document.getElementById('signInMessage');
    if (!playerId) {
        message.innerHTML = '<div class="error">Choose your player name.</div>';
        return;
    }
    const callback = _signInCallback;
    const resolver = _signInResolver;
    const finishSignIn = function() {
        if (callback) callback();
        if (resolver) resolver(getPlayerToken());
    };
    const attemptId = ++_signInAttemptId;
    let hasPin = false;
    {
        setSignInChecking(true, 'Checking this player’s PIN status…');
        const check = await checkPlayerPinWithRetry(playerId, attemptId);
        if (attemptId !== _signInAttemptId) return;
        if (check.error) {
            setSignInChecking(false);
            message.innerHTML = '<div class="error" role="alert">' +
                escapeHtml(check.code === 'NETWORK_TIMEOUT'
                    ? 'The PIN check took too long. Please try again.'
                    : check.code === 'NETWORK_ERROR'
                        ? 'The app could not reach the server. Check your connection and try again.'
                        : (check.error || 'Could not check this player’s PIN status.')) +
                '</div>';
            return;
        }
        hasPin = Boolean(check.has_pin);
    }
    _pendingSignInResolver = resolver;
    setSignInChecking(false);
    document.getElementById('signInModal').classList.remove('active');
    _signInCallback = null;
    _signInResolver = null;
    if (hasPin) openPinEntryModal(playerId, finishSignIn);
    else openPinSetupModal(playerId, finishSignIn, false);
}

function signOutPlayer() {
    setPlayerToken('');
    clearIdentity();
}

function updateEditingStatus() {
    const status = document.getElementById('editingStatus');
    if (!status) return;
    if (getPlayerToken()) {
        status.innerHTML =
            '<span class="editing-unlocked">Signed in as <strong>' + escapeHtml(editingDisplayName()) + '</strong></span> ' +
            '<button type="button" class="link-button" onclick="signInToEdit(true)">Switch player</button> ' +
            '<button type="button" class="link-button" onclick="signOutPlayer()">Sign out</button>';
    } else {
        status.innerHTML = '<button type="button" class="link-button" onclick="signInToEdit(true)">Sign in to edit</button>';
    }
}

async function loadPublicConfig() {
    const data = await apiCall('getPublicConfig', {});
    if (!data.error) {
        publicConfig = Object.assign({}, publicConfig, data);
    }
    const version = document.getElementById('releaseVersion');
    if (version) version.textContent = 'Lockout Tracker · v' + publicConfig.version;
    return publicConfig;
}

function applyPublicConfig(config) {
    if (config && typeof config === 'object') {
        publicConfig = Object.assign({}, publicConfig, config);
    }
    const version = document.getElementById('releaseVersion');
    if (version) version.textContent = 'Lockout Tracker · v' + publicConfig.version;
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

// ============================================
// BUTTON LOADING STATE HELPER
// ============================================
function setButtonLoading(buttonElement, isLoading, originalText) {
    if (isLoading) {
        buttonElement.disabled = true;
        buttonElement.dataset.originalText = buttonElement.textContent;
        const label = String(buttonElement.textContent || '').toLowerCase();
        buttonElement.textContent = /submit|save|create|update|end|delete|add|send/.test(label)
            ? '⏳ Saving...'
            : '⏳ Loading...';
        buttonElement.setAttribute('aria-busy', 'true');
        buttonElement.style.opacity = '0.6';
        buttonElement.style.cursor = 'not-allowed';
    } else {
        buttonElement.disabled = false;
        buttonElement.textContent = originalText || buttonElement.dataset.originalText || 'Submit';
        buttonElement.removeAttribute('aria-busy');
        buttonElement.style.opacity = '1';
        buttonElement.style.cursor = 'pointer';
    }
}

function showStatusToast(message) {
    let toast = document.getElementById('saveStatusToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'saveStatusToast';
        toast.className = 'save-status-toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(window._saveStatusToastTimer);
    window._saveStatusToastTimer = setTimeout(function() {
        toast.classList.remove('visible');
    }, 1800);
}

// ============================================
// API & UTILITY FUNCTIONS
// ============================================
function apiCacheKey(action, params) {
    const sorted = {};
    Object.keys(params || {}).sort().forEach(function(key) {
        sorted[key] = params[key];
    });
    return action + ':' + JSON.stringify(sorted);
}

function markPublicSnapshotDirty() {
    publicSnapshotNeedsRefresh = true;
    try {
        localStorage.setItem(PUBLIC_SNAPSHOT_DIRTY_KEY, '1');
    } catch (error) {
        // In-memory invalidation still protects the current page.
    }
}

function isPublicSnapshotDirty() {
    if (publicSnapshotNeedsRefresh) return true;
    try {
        return localStorage.getItem(PUBLIC_SNAPSHOT_DIRTY_KEY) === '1';
    } catch (error) {
        return false;
    }
}

function clearFrontendReadCaches(options) {
    readCacheGeneration++;
    readResponseCache.clear();
    readRequestInFlight.clear();
    eloHistoryAllCache = null;
    eloHistoryAllCachedAt = 0;
    clearStoredPlayerProfiles();
    markPublicSnapshotDirty();
    if (options && options.players) {
        playersLoaded = false;
        playersLoadedAt = 0;
        allPlayers = [];
        playerCache = {};
    }
}

function clearSessionReadCaches(sessionId) {
    readCacheGeneration++;
    const idVariants = [sessionId, String(sessionId)];
    const numericId = Number(sessionId);
    if (Number.isFinite(numericId)) idVariants.push(numericId);
    const seen = new Set();
    idVariants.forEach(function(id) {
        const marker = typeof id + ':' + String(id);
        if (seen.has(marker)) return;
        seen.add(marker);
        ['getSession', 'getHands'].forEach(function(action) {
            const key = apiCacheKey(action, { session_id: id });
            readResponseCache.delete(key);
            readRequestInFlight.delete(key);
        });
    });
}

function apiErrorMessage(data, fallback) {
    if (!data) return fallback || 'The request could not be completed.';
    if (data.code === 'SESSION_CONFLICT') {
        return 'This game changed on another device. Nothing was saved. Refresh the session before trying again.';
    }
    if (data.code === 'NETWORK_TIMEOUT') {
        return 'The request took too long. Nothing was saved. Check your connection and try again.';
    }
    if (data.code === 'NETWORK_ERROR') {
        return 'The app could not reach the server. Nothing was saved. Check your connection and try again.';
    }
    if (data.code === 'READ_ONLY') {
        return 'This page is using an older cached app file. Refresh the page, then try again.';
    }
    return data.error || fallback || 'The request could not be completed.';
}

function actionErrorHtml(data, fallback, allowSessionRefresh) {
    let html = '<div class="error" role="alert">' + escapeHtml(apiErrorMessage(data, fallback));
    if (allowSessionRefresh && data && data.code === 'SESSION_CONFLICT' && currentSession) {
        html += '<div class="error-actions"><button type="button" class="btn btn-small btn-info" onclick="refreshActiveSessionAfterConflict(this)">Refresh session</button></div>';
    }
    html += '</div>';
    return html;
}

function loadErrorHtml(data, fallback, retryExpression) {
    let html = '<div class="error" role="alert">' + escapeHtml(apiErrorMessage(data, fallback));
    if (retryExpression) {
        html += '<div class="error-actions"><button type="button" class="btn btn-small btn-info" onclick="' +
            escapeAttr(retryExpression) + '">Retry</button></div>';
    }
    return html + '</div>';
}

async function refreshActiveSessionAfterConflict(buttonElement) {
    if (!currentSession) return;
    const sessionId = currentSession.session_id;
    clearSessionReadCaches(sessionId);
    await resumeSession(sessionId, buttonElement);
}

async function rawApiRequest(action, params, isRead) {
    if (!API_URL || API_URL.includes('PASTE_APPS_SCRIPT_')) {
        return { error: 'The app backend has not been connected yet.', code: 'APP_NOT_CONFIGURED' };
    }
    const startedAt = Date.now();
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const requestTimeoutMs = action === 'closeSession' ? CLOSE_SESSION_TIMEOUT_MS : API_REQUEST_TIMEOUT_MS;
    const timeoutId = controller ? setTimeout(function() { controller.abort(); }, requestTimeoutMs) : null;
    try {
        let response;
        if (isRead) {
            const url = new URL(API_URL);
            url.searchParams.append('action', action);
            for (const key in params) {
                if (params[key] !== undefined && params[key] !== null) url.searchParams.append(key, params[key]);
            }
            response = await fetch(url, {
                method: 'GET',
                cache: 'no-store',
                signal: controller ? controller.signal : undefined
            });
        } else {
            response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(Object.assign({ action: action }, params || {})),
                signal: controller ? controller.signal : undefined
            });
        }
        if (!response.ok) {
            const failed = {
                error: 'Network error: ' + response.status + ' ' + response.statusText,
                code: 'NETWORK_ERROR'
            };
            recordApiTiming(action, startedAt, failed);
            return failed;
        }
        const data = await response.json();
        if (data && data.error) {
            console.warn('API [' + action + '] returned error:', data.error);
        }
        recordApiTiming(action, startedAt, data);
        return data;
    } catch (error) {
        console.error('API [' + action + '] failed:', error.message);
        if (error && error.name === 'AbortError') {
            const timedOut = { error: 'The request timed out.', code: 'NETWORK_TIMEOUT' };
            recordApiTiming(action, startedAt, timedOut);
            return timedOut;
        }
        const failed = { error: error.message || 'Network request failed.', code: 'NETWORK_ERROR' };
        recordApiTiming(action, startedAt, failed);
        return failed;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }
}

function isTransientApiFailure(data) {
    return Boolean(data && (data.code === 'NETWORK_TIMEOUT' || data.code === 'NETWORK_ERROR'));
}

function waitForRetry(delayMs) {
    return new Promise(function(resolve) { setTimeout(resolve, delayMs); });
}

function createClientRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
    }
    return 'lockout-' + Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

async function requestWithSafeRetry(action, params, isRead) {
    const firstRequest = rawApiRequest(action, params, isRead);
    let data;
    const shouldHedge = (isRead && HEDGED_READ_ACTIONS.has(action)) ||
        (!isRead && HEDGED_SAFE_POST_ACTIONS.has(action));
    if (shouldHedge) {
        let hedgeTimer = null;
        const firstResult = firstRequest.then(function(value) {
            return { source: 'first', data: value };
        });
        const hedgeGate = new Promise(function(resolve) {
            hedgeTimer = setTimeout(function() {
                hedgeTimer = null;
                resolve({ source: 'hedge' });
            }, isRead ? READ_HEDGE_DELAY_MS : SAFE_POST_HEDGE_DELAY_MS);
        });
        const gateResult = await Promise.race([firstResult, hedgeGate]);
        if (gateResult.source === 'first') {
            if (hedgeTimer) clearTimeout(hedgeTimer);
            data = gateResult.data;
        } else {
            const hedgeParams = !isRead
                ? Object.assign({}, params, { client_retry: '1' })
                : params;
            const hedgeRequest = rawApiRequest(action, hedgeParams, isRead);
            const winner = await Promise.race([
                firstResult,
                hedgeRequest.then(function(value) {
                    return { source: 'hedge', data: value };
                })
            ]);
            if (!isTransientApiFailure(winner.data)) return winner.data;
            data = winner.source === 'first' ? await hedgeRequest : (await firstRequest);
        }
    } else {
        data = await firstRequest;
    }
    if (!isTransientApiFailure(data) || (!isRead && !SAFE_POST_RETRY_ACTIONS.has(action))) return data;
    await waitForRetry(350);
    const retryParams = !isRead
        ? Object.assign({}, params, { client_retry: '1' })
        : params;
    data = await rawApiRequest(action, retryParams, isRead);
    return data;
}

async function brieflyAwaitHomeData(maxWaitMs) {
    if (!homeDashboardPromise) return;
    await Promise.race([
        homeDashboardPromise.catch(function() { return false; }),
        waitForRetry(maxWaitMs)
    ]);
}

async function apiCall(action, params, options) {
    params = Object.assign({}, params || {});
    options = options || {};
    const isRead = READ_ACTIONS.has(action);
    if (!isRead && SAFE_POST_RETRY_ACTIONS.has(action) && !params.client_request_id) {
        params.client_request_id = createClientRequestId();
    }
    if (isRead) {
        const ttl = Number(READ_CACHE_TTL[action] || 0);
        const cacheKey = apiCacheKey(action, params);
        const requestKey = options.forceRefresh ? cacheKey + ':force' : cacheKey;
        const cached = readResponseCache.get(cacheKey);
        if (!options.forceRefresh && ttl > 0 && cached && Date.now() - cached.storedAt < ttl) return cached.data;
        if (readRequestInFlight.has(requestKey)) return readRequestInFlight.get(requestKey);
        const cacheGeneration = readCacheGeneration;
        const request = requestWithSafeRetry(action, params, true)
            .then(function(data) {
                if (ttl > 0 && data && !data.error && cacheGeneration === readCacheGeneration) {
                    readResponseCache.set(cacheKey, { data: data, storedAt: Date.now() });
                }
                return data;
            })
            .finally(function() {
                if (readRequestInFlight.get(requestKey) === request) {
                    readRequestInFlight.delete(requestKey);
                }
            });
        readRequestInFlight.set(requestKey, request);
        return request;
    }
    if (!isRead) {
        if (!UNAUTHENTICATED_WRITE_ACTIONS.has(action)) {
            params.player_token = getPlayerToken() || await signInToEdit(false);
            if (!params.player_token) return { error: 'Sign in to make changes.', code: 'AUTH_REQUIRED' };
        }
        if (SESSION_ACTIONS.has(action)) {
            const sessionId = params.session_id || (currentSession && currentSession.session_id);
            params.revision = currentSession && String(currentSession.session_id) === String(sessionId)
                ? Number(currentSession.revision || 1)
                : Number(params.revision || 1);
        }
    }
    const data = await requestWithSafeRetry(action, params, isRead);
    if (data && (data.code === 'AUTH_EXPIRED' || data.code === 'AUTH_REQUIRED') &&
        !UNAUTHENTICATED_WRITE_ACTIONS.has(action)) signOutPlayer();
    if (data && data.revision && currentSession && String(currentSession.session_id) === String(params.session_id)) {
        currentSession.revision = Number(data.revision);
    }
    if (data && !data.error && DATA_CHANGING_WRITE_ACTIONS.has(action)) {
        clearFrontendReadCaches({ players: action === 'addPlayer' });
    }
    return data;
}

async function ensurePlayersLoaded() {
    if (playersLoaded && Date.now() - playersLoadedAt < READ_CACHE_TTL.getPlayers) return allPlayers;
    await brieflyAwaitHomeData(500);
    if (playersLoaded && Date.now() - playersLoadedAt < READ_CACHE_TTL.getPlayers) return allPlayers;
    const data = await apiCall('getPlayers', {});
    if (data.error) {
        console.error('Error loading players:', data.error);
        return [];
    }
    allPlayers = data;
    playersLoaded = true;
    playersLoadedAt = Date.now();
    for (let i = 0; i < data.length; i++) {
        playerCache[data[i].player_id] = data[i].username;
    }
    return allPlayers;
}

function applyPlayersData(players, storedAt) {
    if (!Array.isArray(players)) return;
    allPlayers = players;
    playersLoaded = true;
    playersLoadedAt = Number(storedAt || Date.now());
    playerCache = {};
    for (let i = 0; i < players.length; i++) {
        playerCache[players[i].player_id] = players[i].username;
    }
}

function storeReadResponse(action, params, data, storedAt) {
    if (data === undefined || data === null || data.error) return;
    readResponseCache.set(apiCacheKey(action, params || {}), {
        data: data,
        storedAt: Number(storedAt || Date.now())
    });
}

function storeSessionReadResponses(item, storedAt) {
    if (!item || !item.session) return;
    const sessionId = item.session.session_id;
    storeReadResponse('getSession', { session_id: sessionId }, item.session, storedAt);
    storeReadResponse('getHands', { session_id: sessionId }, item.hands || [], storedAt);
    if (String(sessionId) !== sessionId) {
        storeReadResponse('getSession', { session_id: String(sessionId) }, item.session, storedAt);
        storeReadResponse('getHands', { session_id: String(sessionId) }, item.hands || [], storedAt);
    }
}

function primeBootstrapReadCaches(data, storedAt) {
    if (!data || typeof data !== 'object') return;
    const at = Number(storedAt || Date.now());
    if (Array.isArray(data.players)) storeReadResponse('getPlayers', {}, data.players, at);
    if (Array.isArray(data.sessions_with_hands)) {
        storeReadResponse('getSessionsWithHands', {}, data.sessions_with_hands, at);
    }
    if (Array.isArray(data.elo_ratings)) storeReadResponse('getEloRatings', {}, data.elo_ratings, at);
    if (Array.isArray(data.elo_history_all)) {
        storeReadResponse('getEloHistoryAll', {}, data.elo_history_all, at);
    }
    if (data.stats_summary && typeof data.stats_summary === 'object') {
        storeReadResponse('getStatsSummary', {}, data.stats_summary, at);
    }
    if (Array.isArray(data.head_to_head_matrix)) {
        storeReadResponse('getHeadToHeadMatrix', {}, data.head_to_head_matrix, at);
    }
    if (data.public_config && typeof data.public_config === 'object') {
        storeReadResponse('getPublicConfig', {}, data.public_config, at);
    }
    Object.keys(data.player_profiles || {}).forEach(function(playerId) {
        storeReadResponse('getPlayerProfile', { player_id: playerId }, data.player_profiles[playerId], at);
        if (/^\d+$/.test(playerId)) {
            storeReadResponse('getPlayerProfile', { player_id: Number(playerId) }, data.player_profiles[playerId], at);
        }
    });
    (data.sessions_with_hands || []).forEach(function(item) {
        storeSessionReadResponses(item, at);
    });
}

function applyBootstrapData(data, storedAt) {
    if (!data || typeof data !== 'object') return false;
    if (data.public_config) applyPublicConfig(data.public_config);
    if (Array.isArray(data.players)) applyPlayersData(data.players, storedAt);
    if (Array.isArray(data.elo_ratings)) eloCache = data.elo_ratings;
    if (Array.isArray(data.elo_history_all)) {
        eloHistoryAllCache = data.elo_history_all;
        eloHistoryAllCachedAt = Number(storedAt || Date.now());
    }
    primeBootstrapReadCaches(data, storedAt);
    refreshVisiblePlayerViewsFromCurrentData();
    return true;
}

function reconcileProfileWithCurrentRating(data) {
    if (!data || !data.player || !data.elo || !data.stats) return data;
    const current = eloCache.find(function(entry) {
        return String(entry.player_id) === String(data.player.player_id);
    });
    if (!current) return data;
    data.elo.current = Number(current.rating);
    data.elo.change = Number(current.change || 0);
    data.elo.provisional = Boolean(current.provisional);
    if (Number.isFinite(Number(current.hands_played))) {
        data.stats.hands_played = Number(current.hands_played);
    }
    return data;
}

function refreshVisiblePlayerViewsFromCurrentData() {
    const playersScreen = document.getElementById('playersScreen');
    if (playersScreen && playersScreen.classList.contains('active') && allPlayers.length && eloCache.length) {
        const directory = document.getElementById('playersScreenContent');
        if (directory) renderPlayersDirectory(directory);
    }
    const profileScreen = document.getElementById('playerProfileScreen');
    if (profileScreen && profileScreen.classList.contains('active') && _currentProfileData) {
        reconcileProfileWithCurrentRating(_currentProfileData);
        renderPlayerProfile(_currentProfileData);
    }
}

function applySessionHistoryBundle(data, storedAt) {
    if (!data || data.error) return false;
    const at = Number(storedAt || Date.now());
    if (Array.isArray(data.sessions_with_hands)) {
        storeReadResponse('getSessionsWithHands', {}, data.sessions_with_hands, at);
        data.sessions_with_hands.forEach(function(item) {
            storeSessionReadResponses(item, at);
        });
    }
    if (Array.isArray(data.elo_history_all)) {
        eloHistoryAllCache = data.elo_history_all;
        eloHistoryAllCachedAt = at;
        storeReadResponse('getEloHistoryAll', {}, data.elo_history_all, at);
    }
    if (Array.isArray(data.elo_ratings)) {
        eloCache = data.elo_ratings;
        storeReadResponse('getEloRatings', {}, data.elo_ratings, at);
    }
    return true;
}

function loadStoredPublicSnapshot() {
    const keys = [PUBLIC_SNAPSHOT_STORAGE_KEY].concat(LEGACY_PUBLIC_SNAPSHOT_STORAGE_KEYS);
    for (let i = 0; i < keys.length; i++) {
        try {
            const raw = localStorage.getItem(keys[i]);
            if (!raw) continue;
            const stored = JSON.parse(raw);
            if (!stored || !stored.data || !Number(stored.stored_at)) continue;
            if (stored.snapshot_schema &&
                Number(stored.snapshot_schema) !== PUBLIC_SNAPSHOT_SCHEMA_VERSION) continue;
            if (Date.now() - Number(stored.stored_at) > PUBLIC_SNAPSHOT_MAX_AGE_MS) continue;
            if (stored.data.public_config && window.LOCKOUT_CONFIG && window.LOCKOUT_CONFIG.version) {
                stored.data.public_config = Object.assign({}, stored.data.public_config, {
                    version: window.LOCKOUT_CONFIG.version
                });
            }
            return stored;
        } catch (error) {
            // Try the next compatible snapshot.
        }
    }
    return null;
}

function saveStoredPublicSnapshot(data) {
    try {
        localStorage.setItem(PUBLIC_SNAPSHOT_STORAGE_KEY, JSON.stringify({
            snapshot_schema: PUBLIC_SNAPSHOT_SCHEMA_VERSION,
            stored_at: Date.now(),
            data: data
        }));
        localStorage.removeItem(PUBLIC_SNAPSHOT_DIRTY_KEY);
        publicSnapshotNeedsRefresh = false;
        LEGACY_PUBLIC_SNAPSHOT_STORAGE_KEYS.forEach(function(key) {
            localStorage.removeItem(key);
        });
    } catch (error) {
        // The app remains fully functional when private browsing blocks storage.
    }
}

function loadStoredPlayerProfile(playerId) {
    try {
        const raw = localStorage.getItem(PROFILE_SNAPSHOT_PREFIX + String(playerId));
        if (!raw) return null;
        const stored = JSON.parse(raw);
        if (!stored || !stored.data || !Number(stored.stored_at)) return null;
        if (Number(stored.snapshot_schema || 0) !== PROFILE_SNAPSHOT_SCHEMA_VERSION) return null;
        if (Date.now() - Number(stored.stored_at) > PROFILE_SNAPSHOT_MAX_AGE_MS) return null;
        return stored;
    } catch (error) {
        return null;
    }
}

function saveStoredPlayerProfile(playerId, data) {
    try {
        const id = String(playerId);
        localStorage.setItem(PROFILE_SNAPSHOT_PREFIX + id, JSON.stringify({
            snapshot_schema: PROFILE_SNAPSHOT_SCHEMA_VERSION,
            stored_at: Date.now(),
            data: data
        }));
        let index = [];
        try {
            index = JSON.parse(localStorage.getItem(PROFILE_SNAPSHOT_INDEX_KEY) || '[]');
        } catch (ignore) {}
        if (!Array.isArray(index)) index = [];
        if (index.indexOf(id) === -1) index.push(id);
        localStorage.setItem(PROFILE_SNAPSHOT_INDEX_KEY, JSON.stringify(index));
    } catch (error) {
        // The in-memory cache still works if storage is unavailable.
    }
}

function clearStoredPlayerProfiles() {
    try {
        let index = [];
        try {
            index = JSON.parse(localStorage.getItem(PROFILE_SNAPSHOT_INDEX_KEY) || '[]');
        } catch (ignore) {}
        if (Array.isArray(index)) {
            index.forEach(function(playerId) {
                localStorage.removeItem(PROFILE_SNAPSHOT_PREFIX + String(playerId));
            });
        }
        localStorage.removeItem(PROFILE_SNAPSHOT_INDEX_KEY);
    } catch (error) {
        // Memory caches have already been cleared.
    }
}

async function renderHomeBootstrap(data) {
    const activeSessionData = Array.isArray(data.active_sessions_with_hands)
        ? data.active_sessions_with_hands
        : (data.sessions_with_hands || []);
    await Promise.all([
        checkActiveSessions(activeSessionData),
        displayEloLeaderboard(data.elo_ratings || [])
    ]);
}

async function refreshHomeDashboardFromServer() {
    const requestedGeneration = readCacheGeneration;
    const data = await apiCall('getHomeData', {}, { forceRefresh: true });
    if (data.error) return false;
    if (requestedGeneration !== readCacheGeneration) return true;
    applyBootstrapData(data, Date.now());
    saveStoredPublicSnapshot(data);
    await renderHomeBootstrap(data);
    return true;
}

function refreshHomeDashboardInBackground() {
    if (homeDashboardRefreshPromise) return homeDashboardRefreshPromise;
    homeDashboardRefreshPromise = refreshHomeDashboardFromServer()
        .catch(function(error) {
            console.warn('Background dashboard refresh failed:', error && error.message || error);
            return false;
        })
        .finally(function() {
            homeDashboardRefreshPromise = null;
        });
    return homeDashboardRefreshPromise;
}

function scheduleHomeDashboardRefresh() {
    if (homeBackgroundRefreshTimer) clearTimeout(homeBackgroundRefreshTimer);
    homeBackgroundRefreshTimer = setTimeout(function() {
        homeBackgroundRefreshTimer = null;
        const home = document.getElementById('homeScreen');
        if (home && home.classList.contains('active')) refreshHomeDashboardInBackground();
    }, 2500);
}

async function loadHomeDashboard() {
    if (homeDashboardPromise) return homeDashboardPromise;
    homeDashboardPromise = (async function() {
        const stored = loadStoredPublicSnapshot();
        if (stored) {
            const snapshotAge = Date.now() - Number(stored.stored_at);
            if (isPublicSnapshotDirty()) {
                const refreshed = await refreshHomeDashboardFromServer();
                if (refreshed) return true;
                applyBootstrapData(stored.data, stored.stored_at);
                await renderHomeBootstrap(stored.data);
                showStatusToast('Showing saved data — refresh when online');
                return false;
            }
            applyBootstrapData(stored.data, stored.stored_at);
            await renderHomeBootstrap(stored.data);
            if (snapshotAge >= HOME_BACKGROUND_REFRESH_MS) {
                scheduleHomeDashboardRefresh();
            }
            return true;
        }

        const loaded = await refreshHomeDashboardFromServer();
        if (!loaded) {
            await Promise.all([loadPublicConfig(), checkActiveSessions(), displayEloLeaderboard()]);
            return false;
        }
        return true;
    })();
    try {
        return await homeDashboardPromise;
    } finally {
        homeDashboardPromise = null;
    }
}

// ============================================
// ELO FUNCTIONS
// ============================================
async function loadEloRatings() {
    const cacheKey = apiCacheKey('getEloRatings', {});
    let cached = readResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.storedAt < READ_CACHE_TTL.getEloRatings) {
        eloCache = cached.data;
        return eloCache;
    }
    await brieflyAwaitHomeData(700);
    cached = readResponseCache.get(cacheKey);
    if (cached && Date.now() - cached.storedAt < READ_CACHE_TTL.getEloRatings) {
        eloCache = cached.data;
        return eloCache;
    }
    const data = await apiCall('getEloRatings', {});
    if (!data.error) {
        eloCache = data;
    }
    return eloCache;
}

async function getCachedEloHistoryAll(forceRefresh) {
    const now = Date.now();
    if (!forceRefresh && eloHistoryAllCache && now - eloHistoryAllCachedAt < 60000) {
        return eloHistoryAllCache;
    }
    const data = await apiCall('getEloHistoryAll', {});
    if (!data.error) {
        eloHistoryAllCache = data;
        eloHistoryAllCachedAt = now;
    }
    return data;
}

function getCachedSessionsWithHands() {
    const cached = readResponseCache.get(apiCacheKey('getSessionsWithHands', {}));
    return cached && Array.isArray(cached.data) ? cached.data : [];
}

function buildHistoricalEloStatusMap(sessionsWithHands, eloHistory) {
    const statusMap = {};
    if (!Array.isArray(sessionsWithHands) || !Array.isArray(eloHistory)) return statusMap;

    const sessionsById = {};
    for (let i = 0; i < sessionsWithHands.length; i++) {
        const item = sessionsWithHands[i];
        if (item && item.session) sessionsById[String(item.session.session_id)] = item;
    }

    const historyBySession = {};
    const sessionOrder = [];
    const sortedHistory = eloHistory.slice().sort(function(a, b) {
        return Number(a.elo_id) - Number(b.elo_id);
    });
    for (let i = 0; i < sortedHistory.length; i++) {
        const entry = sortedHistory[i];
        const sessionId = String(entry.session_id);
        if (!historyBySession[sessionId]) {
            historyBySession[sessionId] = [];
            sessionOrder.push(sessionId);
        }
        historyBySession[sessionId].push(entry);
    }

    const priorRatedHands = {};
    for (let i = 0; i < sessionOrder.length; i++) {
        const sessionId = sessionOrder[i];
        const entries = historyBySession[sessionId];
        const item = sessionsById[sessionId];
        const handNumbersByPlayer = {};
        if (item && Array.isArray(item.hands)) {
            for (let j = 0; j < item.hands.length; j++) {
                const hand = item.hands[j];
                const playerId = String(hand.player_id);
                if (!handNumbersByPlayer[playerId]) handNumbersByPlayer[playerId] = new Set();
                handNumbersByPlayer[playerId].add(String(hand.hand_number));
            }
        }
        for (let j = 0; j < entries.length; j++) {
            const playerId = String(entries[j].player_id);
            const handsBefore = priorRatedHands[playerId] || 0;
            const handsAfter = handsBefore +
                (handNumbersByPlayer[playerId] ? handNumbersByPlayer[playerId].size : 0);
            statusMap[sessionId + '_' + playerId] = {
                provisional: handsAfter < PROVISIONAL_HANDS,
                hands_before: handsBefore,
                hands_after: handsAfter
            };
        }
        Object.keys(handNumbersByPlayer).forEach(function(playerId) {
            priorRatedHands[playerId] = (priorRatedHands[playerId] || 0) + handNumbersByPlayer[playerId].size;
        });
    }

    return statusMap;
}

function buildPlayerHistoricalEloStatusMap(playerId, recentSessions, eloHistory) {
    const statusMap = {};
    if (!Array.isArray(recentSessions) || !Array.isArray(eloHistory)) return statusMap;

    const handCountBySession = {};
    for (let i = 0; i < recentSessions.length; i++) {
        handCountBySession[String(recentSessions[i].session_id)] =
            Math.max(0, Number(recentSessions[i].hand_count || 0));
    }

    let priorRatedHands = 0;
    const sortedHistory = eloHistory.slice().sort(function(a, b) {
        return Number(a.elo_id) - Number(b.elo_id);
    });
    for (let i = 0; i < sortedHistory.length; i++) {
        const entry = sortedHistory[i];
        if (String(entry.player_id) !== String(playerId)) continue;
        const sessionId = String(entry.session_id);
        const handsAfter = priorRatedHands + (handCountBySession[sessionId] || 0);
        statusMap[sessionId + '_' + String(playerId)] = {
            provisional: handsAfter < PROVISIONAL_HANDS,
            hands_before: priorRatedHands,
            hands_after: handsAfter
        };
        priorRatedHands = handsAfter;
    }
    return statusMap;
}

function formatHistoricalEloRating(rating, sessionId, playerId, statusMap) {
    const status = statusMap[String(sessionId) + '_' + String(playerId)];
    if (status) return String(rating) + (status.provisional ? '?' : '');

    // Bootstrap data normally supplies the exact historical status. If it is
    // unavailable, retaining the current marker is safer than hiding it.
    const currentElo = getPlayerElo(playerId);
    return String(rating) + (currentElo && currentElo.provisional ? '?' : '');
}

function becameEstablishedInSession(sessionId, playerId, statusMap) {
    const status = statusMap[String(sessionId) + '_' + String(playerId)];
    return Boolean(status &&
        Number(status.hands_before) < PROVISIONAL_HANDS &&
        Number(status.hands_after) >= PROVISIONAL_HANDS);
}

function formatEstablishedThisGameBadge(sessionId, playerId, statusMap) {
    return becameEstablishedInSession(sessionId, playerId, statusMap)
        ? ' <a href="#" class="elo-established-badge" onclick="event.stopPropagation(); showScreen(\'dictionaryScreen\'); showDictionarySection(\'glossary\', \'glossaryProvisionalRating\'); return false;">Became established</a>'
        : '';
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

async function displayEloLeaderboard(preloadedData) {
    const data = Array.isArray(preloadedData) ? preloadedData : await loadEloRatings();
    if (!data || data.length === 0) return;
    const existingDropdown = document.getElementById('eloDropdownContent');
    if (existingDropdown) {
        eloDropdownOpen = existingDropdown.style.display !== 'none';
    }
    const medals = ['🥇', '🥈', '🥉'];
    const top = data[0];
    const changeColor = top.change >= 0 ? '#4caf50' : '#f44336';
    const changeSign = top.change >= 0 ? '+' : '';

    let html = '<div class="elo-leaderboard-box">';
    html += '<div class="elo-dropdown-header" onclick="toggleEloDropdown()">';
    html += '<span>⚡ ELO Rankings</span>';
    html += '<span class="elo-dropdown-preview">';
    html += '🥇 ' + makePlayerLink(top.player_id, top.username, 'event.stopPropagation();', 'player-link-on-dark') + ' ' + top.rating + (top.provisional ? '?' : '');
    html += '<span class="elo-dropdown-arrow" id="eloDropdownArrow">' +
        (eloDropdownOpen ? ' ▲' : ' ▼') + '</span>';
    html += '</span>';
    html += '</div>';
    html += '<div class="elo-leaderboard-list" id="eloDropdownContent" style="display:' +
        (eloDropdownOpen ? 'block' : 'none') + ';">';
    for (let i = 0; i < data.length; i++) {
        const p = data[i];
        const medal = medals[i] || (i + 1) + '.';
        const pChangeColor = p.change >= 0 ? '#4caf50' : '#f44336';
        const pChangeSign = p.change >= 0 ? '+' : '';
        html += '<div class="elo-leaderboard-row">';
        html += '<span class="elo-rank">' + medal + '</span>';
        html += '<span class="elo-name">' + makePlayerLink(p.player_id, p.username, 'event.stopPropagation();', 'player-link-on-dark') + '</span>';
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
    eloDropdownOpen = !isOpen;
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

    // One combined read avoids three separate Apps Script round-trips.
    let eloStatsData = await apiCall('getEloStatsData', {});
    let ratingsData;
    let sessionsData;
    let allHistoryData;
    if (eloStatsData && !eloStatsData.error) {
        applySessionHistoryBundle(eloStatsData, Date.now());
        ratingsData = eloStatsData.elo_ratings || [];
        sessionsData = eloStatsData.sessions_with_hands || [];
        allHistoryData = eloStatsData.elo_history_all || [];
    } else {
        // Keeps the front end usable while a newly committed Apps Script is being deployed.
        const legacyResults = await Promise.all([
            apiCall('getEloRatings', {}),
            apiCall('getSessionsWithHands', {}),
            getCachedEloHistoryAll(false)
        ]);
        ratingsData = legacyResults[0];
        sessionsData = legacyResults[1];
        allHistoryData = legacyResults[2];
    }
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
        html += '<td><strong>' + makePlayerLink(p.player_id, p.username) + '</strong></td>';
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
    if (!window.Chart) {
        loadChartLibrary()
            .then(function() { drawEloHistoryChart(sessionsData, allHistoryData); })
            .catch(function() {
                const container = document.getElementById('eloChartContainer');
                if (container) container.innerHTML = '<p class="text-muted text-sm p-15">Chart unavailable. The rating table is unaffected.</p>';
            });
        return;
    }
    const container = document.getElementById('eloChartContainer');
    const ctx = document.getElementById('eloHistoryChart');
    if (!ctx) return;
    if (!sessionsData || !allHistoryData || sessionsData.error || allHistoryData.error) return;
    const colors = CHART_COLORS;

    const completedSessions = sessionsData
        .filter(s => s.session.date_ended && s.session.date_ended !== '')
        .filter(s => !hasSessionTag(s.session, 'testing'))
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
    if (!window.confetti) {
        loadConfettiLibrary().then(function() { celebrateWinner(winnerName); }).catch(function() {});
        return;
    }
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

function getPlayerIdByName(username) {
    const player = allPlayers.find(function(item) {
        return String(item.username) === String(username);
    });
    return player ? player.player_id : '';
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

function hasSessionTag(session, tag) {
    const wanted = String(tag || '').trim().toLowerCase();
    if (!wanted) return false;
    return String(session && session.tags || '').split(',').some(value =>
        String(value).trim().toLowerCase() === wanted
    );
}

function calculateAverageHand(handScores) {
    const scores = (handScores || [])
        .map(function(item) { return Number(item && typeof item === 'object' ? item.score : item); })
        .filter(function(score) { return Number.isFinite(score); });
    if (scores.length === 0) return '0';
    return (scores.reduce(function(total, score) { return total + score; }, 0) / scores.length).toFixed(2);
}

function formatPoints(value) {
    return formatCount(value, 'point');
}

function formatCount(value, singular, plural) {
    return String(value) + ' ' + (Number(value) === 1 ? singular : (plural || singular + 's'));
}

function getFalseLockoutPenalty(value) {
    return value === '' || value === null || value === undefined
        ? DEFAULT_FALSE_LOCKOUT_PENALTY
        : Number(value);
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

function getSessionPlayerJoinDetails(session, playerId) {
    const details = { hand: 1, startingScore: 0 };
    if (!session || !session.player_join_info) return details;
    try {
        const fullInfo = JSON.parse(session.player_join_info);
        const info = fullInfo[String(playerId)];
        if (typeof info === 'object' && info !== null) {
            if (info.hand !== undefined) details.hand = Number(info.hand) || 1;
            if (info.starting_score !== undefined) details.startingScore = Number(info.starting_score) || 0;
        } else if (typeof info === 'number') {
            details.hand = info;
        }
    } catch(e) {}
    return details;
}

function formatLateJoinBadge(joinHand, startingScore) {
    if (Number(joinHand) <= 1) return '';
    return ' ' + makeLateJoinDictionaryLink(
        'H' + joinHand + ' · Start ' + startingScore,
        'late-join-badge',
        'Joined Hand ' + joinHand + ' with starting score ' + startingScore
    );
}

function makeLateJoinDictionaryLink(label, extraClass, title) {
    const className = 'inline-link late-join-link' + (extraClass ? ' ' + extraClass : '');
    const titleAttr = title ? ' title="' + escapeAttr(title) + '"' : '';
    return '<a href="#dictionaryScreen" class="' + className + '"' + titleAttr +
        ' onclick="event.stopPropagation(); showScreen(\'dictionaryScreen\'); ' +
        'showDictionarySection(\'glossary\', \'glossaryLateJoiner\'); return false;">' +
        label + '</a>';
}

function formatWormTooltip(context) {
    const dataset = context.dataset || {};
    let label = (dataset.playerName || dataset.label || 'Score') + ': ' + context.formattedValue;
    if (Number(dataset.joinHand) > 1 && context.dataIndex === Number(dataset.joinHand) - 1) {
        const handScore = dataset.handScores && dataset.handScores.length ? dataset.handScores[0] : 0;
        label += ' (start ' + dataset.startingScore + ' + hand ' + handScore + ')';
    }
    return label;
}

function zeroScoreAxisGrid() {
    return {
        color: function(context) {
            return Number(context.tick && context.tick.value) === 0
                ? 'rgba(31, 41, 55, 0.9)'
                : 'rgba(148, 163, 184, 0.25)';
        },
        lineWidth: function(context) {
            return Number(context.tick && context.tick.value) === 0 ? 2 : 1;
        }
    };
}

const zeroScoreLinePlugin = {
    id: 'zeroScoreLine',
    afterDatasetsDraw: function(chart) {
        const yScale = chart.scales && chart.scales.y;
        if (!yScale || yScale.min > 0 || yScale.max < 0) return;
        const y = yScale.getPixelForValue(0);
        const area = chart.chartArea;
        const context = chart.ctx;
        context.save();
        context.beginPath();
        context.moveTo(area.left, y);
        context.lineTo(area.right, y);
        context.lineWidth = 2;
        context.strokeStyle = 'rgba(31, 41, 55, 0.95)';
        context.stroke();
        context.restore();
    }
};

function getPlayerStartingScore(playerId) {
    return getSessionPlayerJoinDetails(currentSession, playerId).startingScore;
}

function getPlayerJoinHand(playerId) {
    return getSessionPlayerJoinDetails(currentSession, playerId).hand;
}

// ============================================
// IMAGE UPLOAD (proxied by Apps Script; the provider key never reaches the browser)
// ============================================

function readFileAsDataUrl(file) {
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function() { resolve(reader.result); };
        reader.onerror = function() { reject(new Error('Could not read the image.')); };
        reader.readAsDataURL(file);
    });
}

function loadPhotoImage(dataUrl) {
    return new Promise(function(resolve, reject) {
        const image = new Image();
        image.onload = function() { resolve(image); };
        image.onerror = function() { reject(new Error('The selected image could not be opened.')); };
        image.src = dataUrl;
    });
}

function canvasPhotoBlob(canvas, quality) {
    return new Promise(function(resolve) {
        canvas.toBlob(resolve, 'image/webp', quality);
    });
}

async function preparePhotoForUpload(file) {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
        return { error: 'Use a JPEG, PNG, WebP, or GIF image.' };
    }
    if (file.size > 15 * 1024 * 1024) {
        return { error: 'Choose an image smaller than 15 MB.' };
    }
    if (file.type === 'image/gif') {
        if (file.size > 5 * 1024 * 1024) {
            return { error: 'Animated GIFs must be 5 MB or smaller.' };
        }
        return { file: file, mimeType: file.type, fileName: file.name };
    }

    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadPhotoImage(originalDataUrl);
    const largestSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (file.size <= 1500 * 1024 && largestSide <= 1920) {
        return { file: file, mimeType: file.type, fileName: file.name };
    }

    let scale = Math.min(1, 1920 / largestSide);
    let width = Math.max(1, Math.round(image.naturalWidth * scale));
    let height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    let context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, width, height);
    let blob = await canvasPhotoBlob(canvas, 0.84);

    if (blob && blob.size > 4500 * 1024) {
        scale = Math.min(1, 1280 / largestSide);
        width = Math.max(1, Math.round(image.naturalWidth * scale));
        height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.width = width;
        canvas.height = height;
        context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        blob = await canvasPhotoBlob(canvas, 0.72);
    }
    if (!blob) return { error: 'The image could not be prepared for upload.' };
    if (blob.size > 5 * 1024 * 1024) {
        return { error: 'The optimised image is still too large. Try a smaller image.' };
    }
    return {
        file: blob,
        mimeType: 'image/webp',
        fileName: String(file.name || 'lockout-photo').replace(/\.[^.]+$/, '') + '.webp',
        optimised: true
    };
}

async function uploadPhotoFile(file) {
    try {
        const prepared = await preparePhotoForUpload(file);
        if (prepared.error) return prepared;
        const dataUrl = await readFileAsDataUrl(prepared.file);
        const context = window._photoUploadContext || { scope: 'new_session' };
        const result = await apiCall('uploadPhoto', Object.assign({}, context, {
            image_base64: String(dataUrl).split(',')[1],
            mime_type: prepared.mimeType,
            file_name: prepared.fileName
        }));
        if (result.error) return { error: result.error };
        return { url: result.url, optimised: Boolean(prepared.optimised) };
    } catch(e) {
        return { error: e.message };
    }
}

// Retained for compatibility with older cached UI handlers.
async function uploadToImgur(file) {
    return uploadPhotoFile(file);
}

function createPhotoUploadUI(currentPhotoUrl, onUploadComplete) {
    let html = '<div class="photo-upload-section">';
    if (currentPhotoUrl && currentPhotoUrl !== '') {
        html += '<div class="photo-preview-container">';
        html += '<img src="' + currentPhotoUrl + '" class="session-photo-preview" alt="Current uploaded photo" onclick="openPhotoFullscreen(\'' + currentPhotoUrl + '\')">';
        html += '<button class="btn btn-danger btn-small mt-10" onclick="removeSessionPhoto()">🗑️ Remove Photo</button>';
        html += '</div>';
    }
    if (!publicConfig.photos_enabled) {
        html += '<p class="text-muted text-sm">Photo uploads are not enabled yet. Your initial will be used instead.</p>';
        html += '</div>';
        return html;
    }
    html += '<label class="photo-upload-label">';
    html += '<input type="file" id="photoFileInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none;" onchange="handlePhotoUpload(event)">';
    html += '<span class="btn btn-info btn-small">📷 ' + (currentPhotoUrl ? 'Change Photo' : 'Add Photo') + '</span>';
    html += '</label>';
    html += '<p class="text-muted text-sm mt-10">JPEG, PNG or WebP up to 15 MB will be resized for faster loading. Animated GIFs must be 5 MB or smaller. Photos are hosted by ImgBB.</p>';
    html += '<div id="photoUploadStatus"></div>';
    html += '</div>';
    return html;
}

async function handlePhotoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const statusDiv = document.getElementById('photoUploadStatus');
    event.target.disabled = true;
    statusDiv.innerHTML = '<div class="loading">⏳ Preparing and uploading photo...</div>';
    const result = await uploadPhotoFile(file);
    event.target.disabled = false;
    event.target.value = '';
    if (result.error) {
        statusDiv.innerHTML = '<div class="error">❌ Upload failed: ' + result.error + '</div>';
        return;
    }
    window._pendingPhotoUrl = result.url;
    statusDiv.innerHTML = '<div class="success">✅ Photo ready' + (result.optimised ? ' and optimised for faster loading' : '') + '</div>';
    const preview = document.querySelector('.session-photo-preview');
    if (preview) {
        preview.src = result.url;
    } else {
        const container = document.querySelector('.photo-upload-section');
        if (container) {
            const previewHtml = '<div class="photo-preview-container"><img src="' + result.url + '" class="session-photo-preview" alt="Newly uploaded photo" onclick="openPhotoFullscreen(\'' + result.url + '\')"></div>';
            container.insertAdjacentHTML('afterbegin', previewHtml);
        }
    }
}

function selectedTagValues(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked'))
        .map(function(input) { return input.value; });
}

function setSelectedTagValues(name, values) {
    const selected = new Set((values || []).map(function(value) { return String(value).trim(); }));
    document.querySelectorAll('input[name="' + name + '"]').forEach(function(input) {
        input.checked = selected.has(input.value);
    });
}

function removeSessionPhoto() {
    window._pendingPhotoUrl = '';
    const container = document.querySelector('.photo-preview-container');
    if (container) container.remove();
    const statusDiv = document.getElementById('photoUploadStatus');
    if (statusDiv) statusDiv.innerHTML = '';
}

function openPhotoFullscreen(url) {
    if (activePhotoOverlay) return;
    const overlay = document.createElement('div');
    overlay.className = 'photo-viewer-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Full-size photo');
    const image = document.createElement('img');
    image.src = url;
    image.alt = 'Full-size uploaded photo';
    image.className = 'photo-viewer-image';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'photo-viewer-close';
    closeButton.setAttribute('aria-label', 'Close full-size photo');
    closeButton.textContent = '×';
    overlay.appendChild(image);
    overlay.appendChild(closeButton);
    overlay.onclick = function(event) {
        if (event.target === overlay || event.target === closeButton) closePhotoFullscreen();
    };
    document.body.appendChild(overlay);
    activePhotoOverlay = overlay;
    photoViewerHistoryActive = true;
    history.pushState(
        Object.assign({}, history.state || {}, { photoViewer: true }),
        '',
        window.location.href
    );
    closeButton.focus();
}

function closePhotoFullscreen(fromHistory) {
    if (!activePhotoOverlay) return;
    if (photoViewerHistoryActive && !fromHistory) {
        history.back();
        return;
    }
    activePhotoOverlay.remove();
    activePhotoOverlay = null;
    photoViewerHistoryActive = false;
}

// ============================================
// SCREEN NAVIGATION
// ============================================
function showScreen(screenId, skipHistory, requestedIntentId) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    if (!isCurrentNavigationIntent(intentId)) return false;

    if (screenId !== 'activeSessionScreen' && activeSessionRefreshTimer) {
        clearTimeout(activeSessionRefreshTimer);
        activeSessionRefreshTimer = null;
    }

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
    if (screenId === 'dictionaryScreen') {
        showDictionarySection('lingo');
    }
    if (screenId === 'startSessionScreen') {
        setTimeout(function() {
            if (isCurrentNavigationIntent(intentId)) loadPlayersForSession();
        }, 150);
    }
    if (screenId === 'homeScreen') {
        setTimeout(function() {
            if (!isCurrentNavigationIntent(intentId)) return;
            loadHomeDashboard();
        }, 150);
    }
    return intentId;
}

function getRestorableScreenFromHash() {
    const requested = String(window.location.hash || '').replace(/^#/, '');
    const restorable = [
        'homeScreen',
        'startSessionScreen',
        'playersScreen',
        'previousSessionsScreen',
        'podcastsScreen',
        'statsScreen',
        'addPlayerScreen',
        'appInstructionsScreen',
        'dictionaryScreen',
        'rulesScreen'
    ];
    return restorable.indexOf(requested) !== -1 && document.getElementById(requested)
        ? requested
        : 'homeScreen';
}

function loadRestoredScreen(screenId, intentId) {
    if (screenId === 'playersScreen') loadPlayersScreen();
    else if (screenId === 'previousSessionsScreen') loadPreviousSessions();
    else if (screenId === 'podcastsScreen') loadPodcasts();
    else if (screenId === 'statsScreen') loadStats(intentId);
}

// ============================================
// PODCASTS
// ============================================
let podcastEpisodesCache = null;

function safePodcastAudioFile(value) {
    const file = String(value || '').trim();
    if (!/^podcasts\/audio\/[a-z0-9][a-z0-9._/-]*\.(mp3|m4a|wav|ogg)$/i.test(file)) return '';
    return file.indexOf('..') === -1 ? file : '';
}

function formatPodcastDate(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    const date = new Date(text + (text.length === 10 ? 'T12:00:00' : ''));
    return Number.isNaN(date.getTime())
        ? text
        : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function renderPodcasts(episodes) {
    const content = document.getElementById('podcastsContent');
    if (!content) return;
    if (!episodes.length) {
        content.innerHTML = '<div class="empty-state">No podcast episodes yet.</div>';
        return;
    }

    content.innerHTML = episodes.map(function(episode) {
        const audioFile = safePodcastAudioFile(episode.audio_file);
        if (!audioFile) return '';
        const description = String(episode.description || '').trim();
        return '<article class="podcast-episode">' +
            '<h3>' + escapeHtml(episode.title || 'Lockout Podcast') + '</h3>' +
            (episode.date ? '<p class="podcast-date">' + escapeHtml(formatPodcastDate(episode.date)) + '</p>' : '') +
            (description ? '<p class="podcast-description">' + escapeHtml(description) + '</p>' : '') +
            '<audio class="podcast-audio" controls preload="metadata">' +
                '<source src="' + escapeAttr(audioFile) + '">' +
                'Your browser does not support audio playback.' +
            '</audio>' +
        '</article>';
    }).join('') || '<div class="empty-state">No playable podcast episodes were found.</div>';
}

async function loadPodcasts(forceRefresh) {
    const content = document.getElementById('podcastsContent');
    if (!content) return;
    if (podcastEpisodesCache && !forceRefresh) {
        renderPodcasts(podcastEpisodesCache);
        return;
    }

    content.innerHTML = '<div class="loading">Loading episodes...</div>';
    try {
        const response = await fetch('podcasts/episodes.json?v=' + encodeURIComponent(
            typeof ASSET_VERSION === 'string' ? ASSET_VERSION : APP_VERSION
        ), {
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('Episode list could not be loaded.');
        const data = await response.json();
        const episodes = Array.isArray(data) ? data : [];
        podcastEpisodesCache = episodes.sort(function(a, b) {
            return String(b.date || '').localeCompare(String(a.date || ''));
        });
        renderPodcasts(podcastEpisodesCache);
    } catch (error) {
        content.innerHTML =
            '<div class="message error">The podcasts could not be loaded.</div>' +
            '<button class="btn btn-small btn-secondary" onclick="loadPodcasts(true)">Try again</button>';
    }
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
    installSearchableSelect(hostSelect, 'Search hosts…');
    const playerList = document.getElementById('playerSelectionList');
    let html = '<ul class="player-list">';
    for (let i = 0; i < allPlayers.length; i++) {
        html += '<li class="player-item"><label><input type="checkbox" value="' + allPlayers[i].player_id + '" class="player-checkbox"> ' + allPlayers[i].username + '</label></li>';
    }
    html += '</ul>';
    playerList.innerHTML = html;
    installPlayerListSearch('playerSelectionList', 'Search players to add…');
    window._pendingPhotoUrl = '';
    window._photoUploadContext = { scope: 'new_session' };
    document.getElementById('createSessionPhotoUpload').innerHTML = createPhotoUploadUI('', null);
}

async function addPlayer(event) {
    const username = document.getElementById('newPlayerName').value.trim();
    const messageDiv = document.getElementById('addPlayerMessage');
    if (!username) { messageDiv.innerHTML = '<div class="error">Please enter a player name</div>'; return; }
    const ownership = document.querySelector('input[name="newPlayerOwnership"]:checked');
    if (!ownership) {
        messageDiv.innerHTML = '<div class="error">Please say whether this is your profile.</div>';
        return;
    }
    const intentId = beginNavigationIntent();
    const addBtn = event.target;
    setButtonLoading(addBtn, true);
    const data = await apiCall('addPlayer', { username: username });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">⚠️ ' + data.error + '</div>';
        setButtonLoading(addBtn, false);
    } else {
        messageDiv.innerHTML = '<div class="success">Player added!</div>';
        document.getElementById('newPlayerName').value = '';
        playersLoaded = false;
        await ensurePlayersLoaded();
        if (ownership.value === 'self') {
            await showPlayerProfile(data.player_id, intentId);
            setButtonLoading(addBtn, false);
            if (_currentProfileData && String(_currentProfileData.player.player_id) === String(data.player_id)) {
                openPinSetupModal(data.player_id, null, true);
            } else {
                alert('Player created, but profile setup could not open. Select the player from the Players screen to finish setup.');
            }
            return;
        }
        setTimeout(function() {
            showScreen('homeScreen', false, intentId);
            setButtonLoading(addBtn, false);
        }, 1000);
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
    installPlayerListSearch('addPlayerList', 'Search available players…');
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
        messageDiv.innerHTML = actionErrorHtml(data, 'The player could not be added.', true);
        if (addBtn) setButtonLoading(addBtn, false);
    } else {
        const startingScore = data.starting_score || 0;
        showStatusToast('Player added');
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
async function checkActiveSessions(preloadedSessions) {
    let sessionsWithHands = preloadedSessions;
    if (!Array.isArray(sessionsWithHands)) {
        const results = await Promise.all([
            ensurePlayersLoaded(),
            apiCall('getSessionsWithHands', {})
        ]);
        sessionsWithHands = results[1];
    }
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
            html += '<div class="active-session-card-actions">';
            if (session.photo_url && session.photo_url !== '') {
                html += '<img src="' + session.photo_url + '" class="active-session-photo" alt="Photo for ' + escapeAttr(session.title) + '" onclick="event.stopPropagation(); openPhotoFullscreen(\'' + session.photo_url + '\')">';
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
                html += '<div class="active-session-leader-name">🏆 ' + makePlayerLink(leaderId, getPlayerName(leaderId), 'event.stopPropagation();') + ' leading</div>';
                html += '<div class="active-session-leader-score">' + formatPoints(playerScores[leaderId]) + '</div>';
                html += '</div>';
            }

            for (let pid in currentStreaks) {
                if (currentStreaks[pid] >= 2) {
                    html += '<div class="active-session-streak-box">🔥 <strong>' + makePlayerLink(pid, getPlayerName(pid)) + ':</strong> ' + currentStreaks[pid] + ' lockout streak</div>';
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
    const tags = selectedTagValues('sessionTags').join(',');
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
    clearSessionReadCaches(sessionId);
    const stateData = await apiCall(
        'getSessionState',
        { session_id: sessionId },
        { forceRefresh: true }
    );
    let sessionData;
    let handsData;
    if (stateData && !stateData.error) {
        const storedAt = Date.now();
        sessionData = stateData.session || {};
        handsData = stateData.hands || [];
        if (Array.isArray(stateData.players)) applyPlayersData(stateData.players, storedAt);
        storeReadResponse('getSession', { session_id: sessionId }, sessionData, storedAt);
        storeReadResponse('getHands', { session_id: sessionId }, handsData, storedAt);
    } else {
        // Backward-compatible fallback for the short window before the script deployment.
        const legacyResults = await Promise.all([
            apiCall('getSession', { session_id: sessionId }, { forceRefresh: true }),
            ensurePlayersLoaded(),
            apiCall('getHands', { session_id: sessionId }, { forceRefresh: true })
        ]);
        sessionData = legacyResults[0];
        handsData = legacyResults[2];
    }
    if (!isCurrentNavigationIntent(intentId)) {
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    if (sessionData.error) {
        alert('Error loading session: ' + apiErrorMessage(sessionData, 'The session could not be loaded.'));
        if (buttonElement) setButtonLoading(buttonElement, false);
        return;
    }
    if (handsData.error) {
        alert('Error loading hand history: ' + apiErrorMessage(handsData, 'The hand history could not be loaded.'));
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
        false_lockout_penalty: getFalseLockoutPenalty(sessionData.false_lockout_penalty),
        photo_url: sessionData.photo_url || '',
        revision: Number(sessionData.revision || 1)
    };
    currentHandNumber = handsData.length === 0 ? 1 : Math.max(...handsData.map(h => h.hand_number)) + 1;
    showActiveSession(intentId, handsData);
    if (buttonElement) setButtonLoading(buttonElement, false);
}

function showActiveSession(requestedIntentId, prefetchedHands) {
    document.getElementById('activeSessionTitle').textContent = currentSession.title;
    let playerNames = sessionPlayers.map(p => {
        const joinHand = getPlayerJoinHand(p.player_id);
        const eloBadge = formatEloBadge(p.player_id);
        const playerLink = makePlayerLink(p.player_id, p.username);
        if (joinHand > 1) return playerLink + ' ' + makeLateJoinDictionaryLink(
            'Joined H' + joinHand,
            'late-join-badge',
            'Late joiner — open the Dictionary'
        ) + ' ' + eloBadge;
        return playerLink + ' ' + eloBadge;
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
    updateSessionScores(prefetchedHands);
    showScreen('activeSessionScreen', false, requestedIntentId);
    scheduleActiveSessionRefresh();
}

function hasUnsavedHandInput() {
    const scoreInputs = document.querySelectorAll('#handScoreInputs input[type="number"]');
    for (let i = 0; i < scoreInputs.length; i++) {
        if (String(scoreInputs[i].value || '').trim() !== '') return true;
    }
    const lockout = document.querySelector('input[name="lockout_player"]:checked');
    const comment = document.getElementById('handComment');
    return Boolean(lockout || (comment && String(comment.value || '').trim()));
}

async function refreshActiveSessionData() {
    const screen = document.getElementById('activeSessionScreen');
    if (!currentSession || !screen || !screen.classList.contains('active')) return false;
    if (activeSessionRefreshPromise) return activeSessionRefreshPromise;
    const sessionId = currentSession.session_id;
    activeSessionRefreshPromise = (async function() {
        const state = await apiCall(
            'getSessionState',
            { session_id: sessionId },
            { forceRefresh: true }
        );
        if (!state || state.error || !state.session || !Array.isArray(state.hands)) return false;
        if (!currentSession || String(currentSession.session_id) !== String(sessionId)) return false;
        const nextHand = state.hands.length
            ? Math.max.apply(null, state.hands.map(function(hand) { return Number(hand.hand_number); })) + 1
            : 1;
        if (nextHand !== currentHandNumber && hasUnsavedHandInput()) {
            showStatusToast('This game changed on another device. Refresh before submitting this hand.');
            return false;
        }
        if (Array.isArray(state.players)) applyPlayersData(state.players, Date.now());
        currentSession.revision = Number(state.session.revision || currentSession.revision || 1);
        currentSession.players_involved = state.session.players_involved;
        currentSession.player_join_info = state.session.player_join_info || '{}';
        currentSession.notes = state.session.notes || '';
        currentSession.tags = state.session.tags || '';
        currentSession.photo_url = state.session.photo_url || '';
        const playerIds = String(state.session.players_involved || '').split(',');
        sessionPlayers = playerIds.map(function(playerId) {
            return allPlayers.find(function(player) {
                return String(player.player_id) === String(playerId).trim();
            });
        }).filter(Boolean);
        if (nextHand !== currentHandNumber) {
            currentHandNumber = nextHand;
            setupHandInputs();
            showStatusToast('Game updated with the latest hand');
        }
        await updateSessionScores(state.hands, { silent: true });
        return true;
    })().finally(function() {
        activeSessionRefreshPromise = null;
        scheduleActiveSessionRefresh();
    });
    return activeSessionRefreshPromise;
}

function scheduleActiveSessionRefresh() {
    if (activeSessionRefreshTimer) clearTimeout(activeSessionRefreshTimer);
    if (!currentSession) return;
    activeSessionRefreshTimer = setTimeout(function() {
        activeSessionRefreshTimer = null;
        refreshActiveSessionData();
    }, ACTIVE_SESSION_REFRESH_MS);
}

function refreshVisibleLiveData() {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    const active = document.querySelector('.screen.active');
    if (!active) return;
    if (active.id === 'activeSessionScreen') refreshActiveSessionData();
    else if (active.id === 'homeScreen') refreshHomeDashboardInBackground();
    else if (active.id === 'playersScreen') loadPlayersScreen(getNavigationIntent());
    else if (active.id === 'playerProfileScreen' && _currentProfileId) {
        const playerId = _currentProfileId;
        apiCall('getPlayerProfile', { player_id: playerId }, { forceRefresh: true })
            .then(function(data) {
                const profileScreen = document.getElementById('playerProfileScreen');
                if (!data.error && profileScreen && profileScreen.classList.contains('active') &&
                    String(_currentProfileId) === String(playerId)) {
                    saveStoredPlayerProfile(playerId, data);
                    _currentProfileData = reconcileProfileWithCurrentRating(data);
                    renderPlayerProfile(_currentProfileData);
                }
            });
    }
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
        html += '<div class="session-photo-container"><img src="' + currentSession.photo_url + '" class="session-photo-full" alt="Current session photo" onclick="openPhotoFullscreen(\'' + currentSession.photo_url + '\')"></div>';
    }
    container.innerHTML = html;
}

function showEditSessionModal() {
    document.getElementById('editSessionNotes').value = decodeHtml(currentSession.notes || '');
    window._pendingPhotoUrl = currentSession.photo_url || '';
    window._photoUploadContext = { scope: 'session', session_id: currentSession.session_id };
    document.getElementById('editSessionPhotoUpload').innerHTML = createPhotoUploadUI(currentSession.photo_url || '', null);
    const currentTags = (currentSession.tags || '').split(',').filter(t => t.trim());
    setSelectedTagValues('editSessionTags', currentTags);
    document.getElementById('editSessionModal').classList.add('active');
}

async function saveEditedSession(event) {
    const notes = document.getElementById('editSessionNotes').value.trim();
    const tags = selectedTagValues('editSessionTags').join(',');
    const saveBtn = event.target;
    setButtonLoading(saveBtn, true);
    let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
    const data = await apiCall('updateSession', {
        session_id: currentSession.session_id, notes: notes, tags: tags,
        editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
    });
    const messageDiv = document.getElementById('editSessionMessage');
    if (data.error) {
        messageDiv.innerHTML = actionErrorHtml(data, 'The session details could not be saved.', true);
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
                messageDiv.innerHTML = actionErrorHtml(
                    photoData,
                    'The details were saved, but the photo could not be updated.',
                    true
                );
                setButtonLoading(saveBtn, false);
                return;
            }
            currentSession.photo_url = window._pendingPhotoUrl;
        }
        showStatusToast('Session changes saved');
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
        document.getElementById('handMessage').innerHTML =
            actionErrorHtml(data, 'The session could not be ended.', true);
        hapticFeedback('error');
        setButtonLoading(endBtn, false);
        return;
    }
    if (!isCurrentNavigationIntent(intentId)) {
        currentSession = null;
        setButtonLoading(endBtn, false);
        return;
    }
    const hasFinalScores = Array.isArray(data.final_scores) && data.final_scores.length > 0;
    const playerTotals = {};
    if (hasFinalScores) {
        for (let i = 0; i < data.final_scores.length; i++) {
            const finalScore = data.final_scores[i];
            const player = allPlayers.find(p => String(p.player_id) === String(finalScore.player_id));
            playerTotals[String(finalScore.player_id)] = {
                username: player ? player.username : getPlayerName(finalScore.player_id),
                total: Number(finalScore.total)
            };
        }
    }
    const scores = Object.values(playerTotals).sort((a, b) => a.total - b.total);
    const winner = scores[0];
    const isTie = hasFinalScores && scores.length > 1 && scores[1].total === winner.total;
    hapticFeedback('success');
    setButtonLoading(endBtn, false);
    eloHistoryAllCache = null;
    eloHistoryAllCachedAt = 0;
    eloCache = [];
    currentSession = null;
    showScreen('homeScreen', false, intentId);
    setTimeout(function() {
        const popup = document.getElementById('sessionEndPopup');
        document.getElementById('sessionEndTitle').textContent = hasFinalScores
            ? (isTie ? 'Tie game!' : winner.username + ' wins!')
            : 'Session complete!';
        document.getElementById('sessionEndScore').textContent = hasFinalScores ? formatPoints(winner.total) : '';
        popup.style.display = 'flex';
        if (hasFinalScores && !isTie) celebrateWinner(winner.username);
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
    const penalty = getFalseLockoutPenalty(currentSession.false_lockout_penalty);
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
        messageDiv.innerHTML = actionErrorHtml(data, 'The hand could not be saved.', true);
        hapticFeedback('error');
        setButtonLoading(submitBtn, false);
    } else {
        currentHandNumber = Number(data.hand_number || currentHandNumber) + 1;
        hapticFeedback('success');
        showStatusToast('Hand saved');
        setupHandInputs();
        await updateSessionScores(Array.isArray(data.hands) ? data.hands : null, { silent: true });
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
    if (handsData.error) {
        document.getElementById('activeHandHistoryBottom').innerHTML =
            '<div class="error">Hand history could not be loaded. Check your connection and try refreshing.</div>';
        return;
    }
    if (handsData.length === 0) {
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
    if (handsData.error) {
        alert(apiErrorMessage(handsData, 'The hand could not be loaded.'));
        if (event && event.target) setButtonLoading(event.target, false);
        return;
    }
    const handsToEdit = handsData.filter(h => h.hand_number == handNumber);
    if (handsToEdit.length === 0) {
        alert('Hand not found');
        if (event && event.target) setButtonLoading(event.target, false);
        return;
    }
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
    const penalty = getFalseLockoutPenalty(currentSession.false_lockout_penalty);
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
        messageDiv.innerHTML = actionErrorHtml(data, 'The hand could not be updated.', true);
        setButtonLoading(saveBtn, false);
    } else {
        showStatusToast('Hand changes saved');
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
        document.getElementById('handMessage').innerHTML =
            actionErrorHtml(data, 'The hand could not be deleted.', true);
        hapticFeedback('error');
        if (event && event.target) setButtonLoading(event.target, false);
    } else {
        if (handNumber == currentHandNumber - 1) { currentHandNumber--; setupHandInputs(); }
        hapticFeedback('success');
        showStatusToast('Hand deleted');
        updateSessionScores();
        if (event && event.target) setButtonLoading(event.target, false);
    }
}

// ============================================
// ACTIVE SESSION SCORING & CHARTS
// ============================================
async function updateSessionScores(prefetchedHands, options) {
    options = options || {};
    if (!options.silent) {
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
    }

    const handsData = Array.isArray(prefetchedHands)
        ? prefetchedHands
        : await apiCall('getHands', { session_id: currentSession.session_id });
    if (Array.isArray(prefetchedHands)) {
        storeReadResponse('getHands', { session_id: currentSession.session_id }, prefetchedHands, Date.now());
    }
    if (handsData.error) {
        document.getElementById('sessionScores').innerHTML = loadErrorHtml(
            handsData,
            'Scores could not be loaded.',
            'updateSessionScores()'
        );
        document.getElementById('activeHandHistoryBottom').innerHTML =
            '<div class="error" role="alert">' +
            escapeHtml(apiErrorMessage(handsData, 'Hand history could not be loaded.')) +
            '</div>';
        return;
    }

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
                totalLockoutScore += lockoutScoreToUse;
                totalLockouts++;
                if (hand.false_lockout == 1 || hand.false_lockout === true) {
                    falseLockoutCount++;
                    playerScores[hand.player_id].falseLockouts++;
                    playerScores[hand.player_id].falseLockoutScores.push(lockoutScoreToUse);
                } else {
                    playerScores[hand.player_id].lockouts++;
                    playerScores[hand.player_id].lockoutScores.push(lockoutScoreToUse);
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
    html += '<th onclick="sortActiveSessionTable(6)" style="cursor: pointer; user-select: none;">Avg LO Score ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(7)" style="cursor: pointer; user-select: none;">False LO ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(8)" style="cursor: pointer; user-select: none;">False LO Rate ⇅</th>';
    html += '<th onclick="sortActiveSessionTable(9)" style="cursor: pointer; user-select: none;">Avg False LO Score ⇅</th>';
    html += '</tr>';

    for (let i = 0; i < scores.length; i++) {
        const p = scores[i];
        const handsPlayed = p.hands.length;
        const avgHand = calculateAverageHand(p.hands);
        const lockoutRate = handsPlayed > 0 ? ((p.lockouts / handsPlayed) * 100).toFixed(1) : '0';
        const lockoutAttemptScores = p.lockoutScores.concat(p.falseLockoutScores);
        const avgLockoutScore = lockoutAttemptScores.length > 0 ? (lockoutAttemptScores.reduce((sum, s) => sum + s, 0) / lockoutAttemptScores.length).toFixed(2) : 'N/A';
        const falseLockoutRate = p.totalLockouts > 0 ? ((p.falseLockouts / p.totalLockouts) * 100).toFixed(1) : '0';
        const avgFalseLockoutScore = p.falseLockoutScores.length > 0 ? (p.falseLockoutScores.reduce((sum, s) => sum + s, 0) / p.falseLockoutScores.length).toFixed(2) : 'N/A';
        html += '<tr>';
        const _pid = sessionPlayers.find(sp => sp.username === p.username).player_id;
        html += '<td><strong>' + makePlayerLink(_pid, p.username) + '</strong>' + formatLateJoinBadge(p.joinHand, getPlayerStartingScore(_pid)) + ' ' + formatEloBadge(_pid) + '</td>';
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
    html += '<div><strong>🏆 Current Leader:</strong> ' + makePlayerLink(getPlayerIdByName(leader.username), leader.username) + ' (' + formatPoints(leader.total) + ')</div>';
    html += '<div><strong>📏 Biggest Gap:</strong> ' + biggestGap + ' points</div>';
    html += '<div><strong>🎯 Most Lockouts:</strong> ' + makePlayerLink(getPlayerIdByName(mostLockoutsPlayer.username), mostLockoutsPlayer.username) + ' (' + mostLockoutsPlayer.lockouts + ')</div>';
    html += '<div><strong>⚠️ False Lockouts:</strong> ' + falseLockoutCount + '</div>';
    html += '</div>';
    html += '<div class="lockout-perf-box">';
    html += '<strong class="term-heading-blue">Lockout Performance:</strong><br>';
    html += '<div class="mt-10">• <strong>Overall Avg:</strong> ' + overallAvgLockout + '</div>';
    for (let i = 0; i < scores.length; i++) {
        const p = scores[i];
        const attemptScores = p.lockoutScores.concat(p.falseLockoutScores);
        if (attemptScores.length > 0) {
            const avgLockout = (attemptScores.reduce((sum, s) => sum + s, 0) / attemptScores.length).toFixed(2);
            const eligibleAverages = scores
                .map(s => s.lockoutScores.concat(s.falseLockoutScores))
                .filter(values => values.length > 0)
                .map(values => values.reduce((sum, score) => sum + score, 0) / values.length);
            const isBest = totalLockouts > 0 && Number(avgLockout) === Math.min(...eligibleAverages);
            html += '<div>• <strong>' + makePlayerLink(getPlayerIdByName(p.username), p.username) + ':</strong> ' + avgLockout + ' (' + attemptScores.length + ' attempts)' + (isBest ? ' ⭐ Best!' : '') + '</div>';
        } else {
            html += '<div>• <strong>' + makePlayerLink(getPlayerIdByName(p.username), p.username) + ':</strong> No lockout attempts yet</div>';
        }
    }
    html += '</div></div>';
    document.getElementById('sessionScores').innerHTML = html;

    const chartSection = document.getElementById('activeSessionCharts');
    if (chartSection && handsData.length > 0) {
        let chartsHtml = '<h3 class="mt-20">Session Graphs</h3>';
        chartsHtml += '<div class="chart-container"><canvas id="activeWormChart"></canvas></div>';
        chartsHtml += '<div class="chart-container"><canvas id="activeManhattanChart"></canvas></div>';
        if (scores.some(p => p.joinHand > 1)) chartsHtml += '<p class="chart-note">Worm includes ' + makeLateJoinDictionaryLink('late-join starts') + '; Manhattan shows hand scores only.</p>';
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
    if (!window.Chart) {
        loadChartLibrary().then(function() { drawActiveWormChart(playerHands, playerIds); }).catch(function() {});
        return;
    }
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
        const playerName = getPlayerName(playerId);
        datasets.push({
            label: playerName + (joinHand > 1 ? ' (H' + joinHand + ', start ' + startingScore + ')' : ''),
            playerName: playerName,
            joinHand: joinHand,
            startingScore: startingScore,
            handScores: hands.slice(),
            data: cumulativeScores,
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.1,
            spanGaps: false
        });
    }
    const labels = [];
    for (let i = 1; i <= maxHands; i++) labels.push('Hand ' + i);
    if (window._activeWormChart) window._activeWormChart.destroy();
    window._activeWormChart = new Chart(ctx.getContext('2d'), { type: 'line', data: { labels, datasets }, plugins: [zeroScoreLinePlugin], options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cricket Worm' }, legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: formatWormTooltip } } }, scales: { y: { title: { display: true, text: 'Cumulative Score' }, grid: zeroScoreAxisGrid() } } } });
}

function drawActiveManhattanChart(playerHands, playerIds) {
    if (!window.Chart) {
        loadChartLibrary().then(function() { drawActiveManhattanChart(playerHands, playerIds); }).catch(function() {});
        return;
    }
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
    window._activeManhattanChart = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets }, plugins: [zeroScoreLinePlugin], options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Manhattan' }, legend: { display: true, position: 'top' } }, scales: { x: { title: { display: true, text: 'Hand Number' } }, y: { title: { display: true, text: 'Score' }, beginAtZero: true, grid: zeroScoreAxisGrid() } } } });
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

    const results = await Promise.all([
        ensurePlayersLoaded(),
        apiCall('getPreviousSessionsData', {})
    ]);
    const historyBundle = results[1];
    let sessionsWithHands;
    let eloHistoryAll;
    if (historyBundle && !historyBundle.error) {
        applySessionHistoryBundle(historyBundle, Date.now());
        sessionsWithHands = historyBundle.sessions_with_hands || [];
        eloHistoryAll = historyBundle.elo_history_all || [];
    } else {
        // Backward-compatible fallback for the short window before the script deployment.
        const legacyResults = await Promise.all([
            apiCall('getSessionsWithHands', {}),
            getCachedEloHistoryAll(false)
        ]);
        sessionsWithHands = legacyResults[0];
        eloHistoryAll = legacyResults[1];
    }
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

    const eloHistoryMap = {};
    if (!eloHistoryAll.error) {
        for (let i = 0; i < eloHistoryAll.length; i++) {
            const entry = eloHistoryAll[i];
            const key = String(entry.session_id) + '_' + String(entry.player_id);
            eloHistoryMap[key] = entry;
        }
    }
    const historicalEloStatusMap = buildHistoricalEloStatusMap(sessionsWithHands, eloHistoryAll);

    let html = '<div class="mb-20"><input type="text" id="sessionSearchInput" placeholder="🔍 Search sessions by title, player, or tag..." style="width: 100%; padding: 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 1em;" oninput="filterSessions()"></div>';
    html += '<div id="sessionListContainer" style="max-height: 600px; overflow-y: auto; padding-right: 5px;"><ul class="session-list" id="sessionList">';

    for (let i = 0; i < completedSessions.length; i++) {
        const session = completedSessions[i].session;
        const hands = completedSessions[i].hands;
        var cleanDate = formatUKDate(session.date_started);
        var playedPlayerIds = new Set(hands.map(function(hand) { return String(hand.player_id); }));
        var playerIds = session.players_involved.split(',').map(function(playerId) {
            return String(playerId).trim();
        }).filter(function(playerId) {
            return playedPlayerIds.has(playerId);
        });
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
        var lowestScore = Infinity, winnerIds = [];
        for (var pid in playerTotals) {
            if (playerTotals[pid] < lowestScore) {
                lowestScore = playerTotals[pid];
                winnerIds = [pid];
            } else if (playerTotals[pid] === lowestScore) {
                winnerIds.push(pid);
            }
        }
        var isTiedSession = winnerIds.length > 1;
        var winnerId = winnerIds.length === 1 ? winnerIds[0] : null;
        var winnerName = winnerIds.length
            ? winnerIds.map(function(playerId) {
                return makePlayerLink(playerId, getPlayerName(playerId), 'event.stopPropagation();');
            }).join(' & ')
            : 'Unknown';

html += '<li class="session-item" onclick="viewSessionDetail(' + i + ', this)">';
html += '<div class="session-item-header" style="display:flex; justify-content:space-between; align-items:center;">';
html += '<span>' + escapeAttr(session.title) + '</span>';
        if (session.photo_url && session.photo_url !== '') {
            html += '<img src="' + session.photo_url + '" alt="Session thumbnail" style="width:48px;height:48px;object-fit:cover;border-radius:6px;cursor:pointer;" onclick="event.stopPropagation(); openPhotoFullscreen(\'' + session.photo_url + '\')">';
        }
        html += '</div>';
        html += '<div class="session-item-info" style="display: flex; flex-direction: column; gap: 4px; margin-top: 8px;">';
        html += '<div>📅 ' + cleanDate + ' • ' + formatCount(handCount, 'hand') + ' • ' + formatCount(playerIds.length, 'player') + '</div>';
        let winnerLine = isTiedSession ? '🤝 Tie — ' + winnerName : '🏆 ' + winnerName;
        if (winnerId) {
            const eloEntry = eloHistoryMap[String(session.session_id) + '_' + String(winnerId)];
            if (eloEntry) {
                const newRating = Math.round(Number(eloEntry.new_rating));
                const change = Math.round(Number(eloEntry.change));
                const changeStr = change >= 0 ? '+' + change : String(change);
                const changeColor = change > 0 ? '#4caf50' : change < 0 ? '#f5576c' : '#666';
                const displayedRating = formatHistoricalEloRating(newRating, session.session_id, winnerId, historicalEloStatusMap);
                winnerLine += ' <span class="elo-badge" style="background:#1a1a2e; color:#ffd700; font-size:0.75em;">⚡ ' + displayedRating + '</span>' +
                              ' <span style="color:' + changeColor + '; font-weight:600; font-size:0.8em;">(' + changeStr + ')</span>' +
                              ' <span style="color:#888; font-size:0.85em;">• ' + formatPoints(lowestScore) + '</span>';
            } else {
                winnerLine += ' <span style="color:#888; font-size:0.85em;">• ' + formatPoints(lowestScore) + '</span>';
            }
        } else {
            winnerLine += ' <span style="color:#888; font-size:0.85em;">• ' + formatPoints(lowestScore) + '</span>';
        }
        html += '<div style="color: ' + (isTiedSession ? '#b26a00' : '#4caf50') + '; font-weight: 600;">' + winnerLine + '</div>';

        const establishedPlayerIds = playerIds.filter(function(playerId) {
            return becameEstablishedInSession(session.session_id, playerId, historicalEloStatusMap);
        });
        if (establishedPlayerIds.length) {
            const establishedNames = establishedPlayerIds.map(function(playerId) {
                return makePlayerLink(playerId, getPlayerName(playerId), 'event.stopPropagation();');
            }).join(' & ');
            html += '<div style="margin-top:2px;">' + establishedNames +
                formatEstablishedThisGameBadge(session.session_id, establishedPlayerIds[0], historicalEloStatusMap) +
                '</div>';
        }

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

    const cachedHands = window.sessionsHandsCache &&
        window.sessionsHandsCache[String(session.session_id)];
    let handsData = Array.isArray(cachedHands)
        ? cachedHands
        : await apiCall('getHands', { session_id: session.session_id });
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
            for (let playerId in joinInfo) {
                const details = getSessionPlayerJoinDetails(session, playerId);
                joiners.push(getPlayerName(playerId) + ' — H' + details.hand + ', start ' + details.startingScore);
            }
            metadataHtml += joiners.join(', ') + '</p>';
        }
        metadataHtml += '</div>';
    }
    if (session.photo_url && session.photo_url !== '') {
        metadataHtml += '<div class="session-photo-container"><img src="' + session.photo_url + '" class="session-photo-full" alt="Session photo" onclick="openPhotoFullscreen(\'' + session.photo_url + '\')"></div>';
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
            if (hand.false_lockout == 1 || hand.false_lockout === true) { playerStats[pid].falseLockouts++; playerStats[pid].falseLockoutScores.push(lockoutScoreToUse); }
            else { playerStats[pid].lockouts++; playerStats[pid].lockoutScores.push(lockoutScoreToUse); }
        }
    }

const sortedPlayers = Object.keys(playerTotals).sort(function(a, b) { return playerTotals[a] - playerTotals[b]; });

    const sessionElo = {};
    const eloHistoryAll = await getCachedEloHistoryAll(false);
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
    const historicalEloStatusMap = buildHistoricalEloStatusMap(getCachedSessionsWithHands(), eloHistoryAll);
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
        const lockoutAttemptScores = stats.lockoutScores.concat(stats.falseLockoutScores);
        const avgLockoutScore = lockoutAttemptScores.length > 0 ? (lockoutAttemptScores.reduce((sum, s) => sum + s, 0) / lockoutAttemptScores.length).toFixed(2) : 'N/A';
        const falseLockoutRate = stats.totalLockouts > 0 ? ((stats.falseLockouts / stats.totalLockouts) * 100).toFixed(1) : '0';
        const avgFalseLockoutScore = stats.falseLockoutScores.length > 0 ? (stats.falseLockoutScores.reduce((sum, s) => sum + s, 0) / stats.falseLockoutScores.length).toFixed(2) : 'N/A';
        let eloBadge = '';
        if (hasElo && sessionElo[playerId]) {
            const change = sessionElo[playerId].change;
            const changeStr = change >= 0 ? '+' + change : String(change);
            const changeColor = change > 0 ? '#4caf50' : change < 0 ? '#f5576c' : '#666';
            const displayedRating = formatHistoricalEloRating(sessionElo[playerId].new_rating, session.session_id, playerId, historicalEloStatusMap);
            eloBadge = ' <span class="elo-badge" style="background:#1a1a2e; color:#ffd700; font-size:0.75em;">⚡ ' + displayedRating + '</span>' +
                       '<span style="color:' + changeColor + '; font-weight:600; font-size:0.8em;"> (' + changeStr + ')</span>' +
                       formatEstablishedThisGameBadge(session.session_id, playerId, historicalEloStatusMap);
        }
        const joinDetails = getSessionPlayerJoinDetails(session, playerId);
        html += '<tr><td><strong>' + makePlayerLink(playerId, getPlayerName(playerId)) + '</strong>' + formatLateJoinBadge(joinDetails.hand, joinDetails.startingScore) + eloBadge + '</td><td>' + total + '</td><td>' + handsPlayed + '</td><td>' + avgHand + '</td><td>' + stats.lockouts + '</td><td>' + lockoutRate + '%</td><td>' + avgLockoutScore + '</td><td>' + stats.falseLockouts + '</td><td>' + falseLockoutRate + '%</td><td>' + avgFalseLockoutScore + '</td></tr>';
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
    if (Object.keys(joinInfo).length > 0) graphsHtml += '<p class="chart-note">Worm includes ' + makeLateJoinDictionaryLink('late-join starts') + '; Manhattan shows hand scores only.</p>';
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
    if (!window.Chart) {
        loadChartLibrary().then(function() {
            drawSessionWormChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session);
        }).catch(function() {});
        return;
    }
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
        const playerName = getPlayerName(playerId);
        datasets.push({
            label: playerName + (joinHand > 1 ? ' (H' + joinHand + ', start ' + startingScore + ')' : ''),
            playerName: playerName,
            joinHand: joinHand,
            startingScore: startingScore,
            handScores: hands.map(hand => hand.score),
            data: dataPoints,
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.1,
            spanGaps: false
        });
    }
    const labels = [];
    for (let i = 1; i <= maxHand; i++) labels.push('Hand ' + i);
    if (window._sessionWormChart) window._sessionWormChart.destroy();
    window._sessionWormChart = new Chart(ctx.getContext('2d'), { type: 'line', data: { labels, datasets }, plugins: [zeroScoreLinePlugin], options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Cricket Worm' }, legend: { display: true, position: 'top' }, tooltip: { callbacks: { label: formatWormTooltip } } }, scales: { y: { title: { display: true, text: 'Cumulative Score' }, grid: zeroScoreAxisGrid() } } } });
}

function drawSessionManhattanChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session) {
    if (!window.Chart) {
        loadChartLibrary().then(function() {
            drawSessionManhattanChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session);
        }).catch(function() {});
        return;
    }
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
    window._sessionManhattanChart = new Chart(ctx.getContext('2d'), { type: 'bar', data: { labels, datasets }, plugins: [zeroScoreLinePlugin], options: { responsive: true, maintainAspectRatio: false, plugins: { title: { display: true, text: 'Manhattan' }, legend: { display: true, position: 'top' } }, scales: { x: { title: { display: true, text: 'Hand Number' } }, y: { title: { display: true, text: 'Score' }, beginAtZero: true, grid: zeroScoreAxisGrid() } } } });
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
    const summary = await apiCall('getStatsSummary', {});
    if (!isCurrentNavigationIntent(intentId)) return false;
    if (summary.error) {
        contentDiv.innerHTML = loadErrorHtml(summary, 'Statistics could not be loaded.', 'showOverallStats()');
        return false;
    }
    if (!isCurrentNavigationIntent(intentId)) return false;
    displayOverallStats(summary.stats || {}, Number(summary.total_sessions || 0));
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
                    if (hand.false_lockout == 1 || hand.false_lockout === true) {
                        playerStats[hand.player_id].falseLockouts++;
                        playerStats[hand.player_id].falseLockoutScores.push(lockoutScoreToUse);
                        playerStats[hand.player_id].currentHandStreak = 0;
                    } else {
                        playerStats[hand.player_id].lockoutScores.push(lockoutScoreToUse);
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
        const attemptScores = ps.lockoutScores.concat(ps.falseLockoutScores);
        if (attemptScores.length > 0) { const als = attemptScores.reduce((sum, score) => sum + score, 0) / attemptScores.length; if (als < statValues.avgLockout.best) { statValues.avgLockout.best = als; statValues.avgLockout.winners = [ps.username]; statValues.avgLockout.value = als.toFixed(2); } else if (als === statValues.avgLockout.best) statValues.avgLockout.winners.push(ps.username); }
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
    html += '<div class="warning-box mt-15 mb-15 text-sm"><strong>ℹ️ Note:</strong> Testing sessions are excluded. Hand-level stats include active non-testing sessions; session-level stats only include completed non-testing sessions. <strong>Avg LO Score</strong> is the average score at declaration across all lockout attempts, whether successful or false. <strong>LO Rate</strong> = successful lockouts ÷ hands played. <strong>False LO Rate</strong> = false lockouts ÷ total lockout attempts.</div>';
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
        const lockoutAttemptScores = ps.lockoutScores.concat(ps.falseLockoutScores);
        const avgLockoutScore = lockoutAttemptScores.length > 0 ? (lockoutAttemptScores.reduce((sum, score) => sum + score, 0) / lockoutAttemptScores.length).toFixed(2) : 'N/A';
        const avgFalseLockoutScore = ps.falseLockoutScores.length > 0 ? (ps.falseLockoutScores.reduce((sum, score) => sum + score, 0) / ps.falseLockoutScores.length).toFixed(2) : 'N/A';
        html += '<tr><td>' + makePlayerLink(playerId, ps.username) + formatEloBadge(playerId) + '</td><td>' + ps.sessionsPlayed + '</td><td>' + ps.sessionsWon.toFixed(1) + '</td><td>' + sessionWinRate + '%</td><td>' + ps.handsPlayed + '</td><td>' + avgScore + '</td><td>' + ps.handsWon + '</td><td>' + lockoutRate + '%</td><td>' + avgLockoutScore + '</td><td>' + ps.falseLockouts + '</td><td>' + falseLockoutRate + '%</td><td>' + avgFalseLockoutScore + '</td></tr>';
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
    if (data.error) {
        contentDiv.innerHTML = loadErrorHtml(data, 'Head-to-head records could not be loaded.', 'showHeadToHeadList()');
        return;
    }
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
        html += '<strong class="heading-blue">' + makePlayerLink(m.p1, p1Name) + '</strong>';
        html += '<span class="h2h-score-span">' + m.p1_wins + '-' + m.ties + '-' + m.p2_wins + '</span>';
        html += '<strong class="heading-red">' + makePlayerLink(m.p2, p2Name) + '</strong>';
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
    await showPlayerComparison(intentId, p1Id, p2Id);
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
    installSearchableSelect('comparisonPlayer1', 'Search player one…');
    installSearchableSelect('comparisonPlayer2', 'Search player two…');
    setTimeout(function() {
        if (!isCurrentNavigationIntent(intentId)) return;
        const btn = document.getElementById('comparePlayersBtn');
        if (btn) btn.addEventListener('click', showPlayerComparison);
    }, 50);
    return true;
}

async function showPlayerComparison(requestedIntentId, requestedPlayer1Id, requestedPlayer2Id) {
    const intentId = typeof requestedIntentId === 'number'
        ? requestedIntentId
        : beginNavigationIntent();
    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return;
    const contentDiv = document.getElementById('statsContent');
    const directComparison = requestedPlayer1Id !== undefined && requestedPlayer2Id !== undefined;
    const p1Select = directComparison ? null : document.getElementById('comparisonPlayer1');
    const p2Select = directComparison ? null : document.getElementById('comparisonPlayer2');
    if (!directComparison && (!p1Select || !p2Select)) {
        contentDiv.innerHTML = loadErrorHtml(null, 'Please select players from the comparison screen.', 'showPlayerComparisonUI()');
        return;
    }
    const p1Id = directComparison ? String(requestedPlayer1Id) : p1Select.value;
    const p2Id = directComparison ? String(requestedPlayer2Id) : p2Select.value;
    if (!p1Id || !p2Id) { contentDiv.innerHTML = '<div class="error">Please select two players</div>'; return; }
    if (p1Id === p2Id) { contentDiv.innerHTML = '<div class="error">Please select two different players</div>'; return; }

    const loadingComparisonLabel = getPlayerName(p1Id) + ' vs ' + getPlayerName(p2Id);
    contentDiv.innerHTML =
        '<div class="skeleton-card">' +
            '<h3 class="section-heading-blue mb-20">Loading ' + escapeHtml(loadingComparisonLabel) + '…</h3>' +
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
    if (data.error) {
        contentDiv.innerHTML = loadErrorHtml(
            data,
            'The comparison could not be loaded.',
            'quickCompare(' + Number(p1Id) + ',' + Number(p2Id) + ')'
        );
        return;
    }

    const p1Name = getPlayerName(p1Id), p2Name = getPlayerName(p2Id);
    let html = '';

    html += '<div class="comparison-vs-header"><h2 class="comparison-vs-title">' + makePlayerLink(p1Id, p1Name, '', 'player-link-on-dark') + ' ' + formatEloBadge(p1Id) + ' vs ' + makePlayerLink(p2Id, p2Name, '', 'player-link-on-dark') + ' ' + formatEloBadge(p2Id) + '</h2></div>';
    html += '<button class="btn btn-info mb-20" onclick="showPlayerComparisonUI()" style="width: 100%;">← Change Players</button>';

    const ts = data.sessions_together_stats;

    html += '<div class="section-box section-box-blue">';
    html += '<h3 class="section-heading-blue">📊 Sessions Together</h3>';
    html += '<p class="text-muted text-sm mb-20"><strong>Head-to-head record:</strong> Who finished with a lower score when both players competed in the same session (regardless of who won overall)</p>';

    if (ts.total_sessions === 0) {
        html += '<div class="content-card" style="text-align: center; color: #666;">These players have never played together</div>';
    } else {
        html += '<div class="overflow-x-auto"><table class="scores-table">';
        html += '<tr><th>Stat</th><th style="color: white; background: #667eea;">' + makePlayerLink(p1Id, p1Name, '', 'player-link-on-dark') + '</th><th style="color: white; background: #f5576c;">' + makePlayerLink(p2Id, p2Name, '', 'player-link-on-dark') + '</th></tr>';
        html += '<tr><td><strong>Wins</strong></td><td>' + ts.p1_wins + '</td><td>' + ts.p2_wins + '</td></tr>';
        html += '<tr><td><strong>Win Rate</strong></td><td>' + ts.p1_win_rate + '%</td><td>' + ts.p2_win_rate + '%</td></tr>';
        html += '<tr><td><strong>Total Score</strong></td><td>' + ts.p1_total_score + '</td><td>' + ts.p2_total_score + '</td></tr>';
        html += '<tr><td><strong>Hands Played</strong></td><td>' + ts.p1_total_hands + '</td><td>' + ts.p2_total_hands + '</td></tr>';
        html += '<tr><td><strong>Avg Hand</strong></td><td>' + ts.p1_avg_hand + '</td><td>' + ts.p2_avg_hand + '</td></tr>';
        html += '<tr><td><strong>Lockouts</strong></td><td>' + ts.p1_lockouts + '</td><td>' + ts.p2_lockouts + '</td></tr>';
        html += '<tr><td><strong>Lockout Rate</strong></td><td>' + ts.p1_lockout_rate + '%</td><td>' + ts.p2_lockout_rate + '%</td></tr>';
        html += '<tr><td><strong>Avg Lockout Score</strong></td><td>' + (ts.p1_lockouts + ts.p1_false_lockouts > 0 ? ts.p1_avg_lockout : 'N/A') + '</td><td>' + (ts.p2_lockouts + ts.p2_false_lockouts > 0 ? ts.p2_avg_lockout : 'N/A') + '</td></tr>';
        html += '<tr><td><strong>False Lockouts</strong></td><td>' + ts.p1_false_lockouts + '</td><td>' + ts.p2_false_lockouts + '</td></tr>';
        html += '<tr><td><strong>False Lockout Rate</strong></td><td>' + (ts.p1_false_lockouts + ts.p1_lockouts > 0 ? ts.p1_false_lockout_rate + '%' : 'N/A') + '</td><td>' + (ts.p2_false_lockouts + ts.p2_lockouts > 0 ? ts.p2_false_lockout_rate + '%' : 'N/A') + '</td></tr>';
        html += '<tr><td><strong>Avg False LO Score</strong></td><td>' + (ts.p1_false_lockouts > 0 ? ts.p1_avg_false_lockout : 'N/A') + '</td><td>' + (ts.p2_false_lockouts > 0 ? ts.p2_avg_false_lockout : 'N/A') + '</td></tr>';
        html += '</table></div>';

        if (ts.best_with && ts.worst_with && ts.best_with.player_id !== ts.worst_with.player_id) {
            html += '<div class="warning-box mt-20">';
            html += '<h4 class="comparison-context-heading">📊 Performance Context</h4>';
            html += '<p class="text-muted text-sm mb-10">When ' + p1Name + ' plays against ' + p2Name + ' <strong>head-to-head</strong>, ' + p1Name + '\'s win rate varies depending on who else is playing:</p>';
            html += '<div class="content-card-sm"><div style="font-size: 0.85em; color: #4caf50; font-weight: 600; margin-bottom: 3px;">✅ Best with ' + makePlayerLink(ts.best_with.player_id, getPlayerName(ts.best_with.player_id)) + '</div>';
            html += '<div class="text-sm" style="color: #333;">' + p1Name + ' beats ' + p2Name + ' in ' + ts.best_with.wins + ' out of ' + ts.best_with.total + ' sessions when ' + getPlayerName(ts.best_with.player_id) + ' is also playing</div></div>';
            html += '<div class="content-card-sm"><div style="font-size: 0.85em; color: #f44336; font-weight: 600; margin-bottom: 3px;">❌ Worst with ' + makePlayerLink(ts.worst_with.player_id, getPlayerName(ts.worst_with.player_id)) + '</div>';
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
    html += '<tr><th>Stat</th><th style="color: white; background: #667eea;">' + makePlayerLink(p1Id, p1Name, '', 'player-link-on-dark') + '</th><th style="color: white; background: #f5576c;">' + makePlayerLink(p2Id, p2Name, '', 'player-link-on-dark') + '</th></tr>';
    html += '<tr><td><strong>Wins</strong></td><td>' + as1.wins + '</td><td>' + as2.wins + '</td></tr>';
    html += '<tr><td><strong>Losses</strong></td><td>' + as1.losses + '</td><td>' + as2.losses + '</td></tr>';
    if (as1.ties > 0 || as2.ties > 0) html += '<tr><td><strong>Ties</strong></td><td>' + as1.ties + '</td><td>' + as2.ties + '</td></tr>';
    html += '<tr><td><strong>Win Rate</strong></td><td>' + as1.win_rate + '%</td><td>' + as2.win_rate + '%</td></tr>';
    html += '<tr><td><strong>Total Score</strong></td><td>' + as1.total_score + '</td><td>' + as2.total_score + '</td></tr>';
    html += '<tr><td><strong>Hands Played</strong></td><td>' + as1.total_hands + '</td><td>' + as2.total_hands + '</td></tr>';
    html += '<tr><td><strong>Avg Hand</strong></td><td>' + as1.avg_hand + '</td><td>' + as2.avg_hand + '</td></tr>';
    html += '<tr><td><strong>Lockouts</strong></td><td>' + as1.lockouts + '</td><td>' + as2.lockouts + '</td></tr>';
    html += '<tr><td><strong>Lockout Rate</strong></td><td>' + as1.lockout_rate + '%</td><td>' + as2.lockout_rate + '%</td></tr>';
    html += '<tr><td><strong>Avg Lockout Score</strong></td><td>' + (as1.lockouts + as1.false_lockouts > 0 ? as1.avg_lockout : 'N/A') + '</td><td>' + (as2.lockouts + as2.false_lockouts > 0 ? as2.avg_lockout : 'N/A') + '</td></tr>';
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
            html += '<div class="text-sm"><strong class="heading-blue">' + p1Name + ':</strong> ' + formatPoints(s.p1_score) + '</div>';
            html += '<div class="text-sm"><strong class="heading-red">' + p2Name + ':</strong> ' + formatPoints(s.p2_score) + '</div>';
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
    console.log('Lockout Tracker ' + (window.LOCKOUT_CONFIG && window.LOCKOUT_CONFIG.version || 'v2.1.1'));
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

    const initialScreen = getRestorableScreenFromHash();
    history.replaceState({ screen: initialScreen }, '', '#' + initialScreen);
    if (initialScreen === 'homeScreen') {
        loadHomeDashboard();
    } else {
        loadPublicConfig();
        const intentId = showScreen(initialScreen, true);
        loadRestoredScreen(initialScreen, intentId);
    }
    showDictionarySection('lingo');
});

// ============================================
// BROWSER BACK BUTTON HANDLING
// ============================================
window.addEventListener('popstate', function(event) {
    if (activePhotoOverlay) {
        closePhotoFullscreen(true);
        return;
    }
    if (event.state && event.state.screen) {
        showScreen(event.state.screen, true);
    } else {
        showScreen('homeScreen', true);
    }
});

window.addEventListener('focus', refreshVisibleLiveData);
document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') refreshVisibleLiveData();
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && activePhotoOverlay) {
        closePhotoFullscreen();
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
    if (!window.confetti) {
        loadConfettiLibrary().then(triggerEasterEgg).catch(function() {});
        return;
    }
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
let _pinSetupSubmitting = false;
let _pinSetupCallback = null;
let _pinSetupOpenProfile = false;

function openPinSetupModal(playerId, callback, openProfileAfter) {
    _pinSetupPlayerId = playerId;
    _pinSetupCallback = callback || null;
    _pinSetupOpenProfile = Boolean(openProfileAfter);
    _pinSetupBuffer = '';
    _pinSetupSubmitting = false;
    setPinKeypadBusy('pinSetup', false);
    updatePinDots('pinSetup', 0);
    document.getElementById('pinSetupMessage').innerHTML = '';
    document.getElementById('pinSetupModal').classList.add('active');
    setTimeout(function() {
        const firstKey = document.querySelector('#pinSetupKeypad .pin-key:not(:disabled)');
        if (firstKey) firstKey.focus();
    }, 0);
}

function closePinSetupModal() {
    if (_pinSetupSubmitting) return;
    document.getElementById('pinSetupModal').classList.remove('active');
    _pinSetupBuffer = '';
    _pinSetupPlayerId = null;
    _pinSetupCallback = null;
    _pinSetupOpenProfile = false;
    if (_pendingSignInResolver) _pendingSignInResolver('');
    _pendingSignInResolver = null;
}

function updatePinDots(prefix, count) {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById(prefix + 'Dot' + i);
        if (dot) dot.classList.toggle('filled', i < count);
    }
    const display = document.getElementById(prefix + 'Display');
    if (display) display.setAttribute('aria-label', count + ' of 4 PIN digits entered');
}

function setPinKeypadBusy(prefix, isBusy) {
    const keypad = document.getElementById(prefix + 'Keypad');
    const modal = document.getElementById(prefix + 'Modal');
    if (!keypad || !modal) return;
    keypad.classList.toggle('is-busy', isBusy);
    keypad.setAttribute('aria-busy', isBusy ? 'true' : 'false');
    keypad.querySelectorAll('button:not(.pin-key-empty)').forEach(function(button) {
        button.disabled = isBusy;
    });
    modal.querySelectorAll('.modal-close, .modal-cancel').forEach(function(button) {
        button.disabled = isBusy;
    });
}

function pinSetupInput(digit) {
    if (_pinSetupSubmitting || _pinSetupBuffer.length >= 4) return;
    _pinSetupBuffer += digit;
    updatePinDots('pinSetup', _pinSetupBuffer.length);
    hapticFeedback('light');
    if (_pinSetupBuffer.length === 4) {
        setTimeout(confirmPinSetup, 200);
    }
}

function pinSetupClear() {
    if (_pinSetupSubmitting) return;
    if (_pinSetupBuffer.length > 0) {
        _pinSetupBuffer = _pinSetupBuffer.slice(0, -1);
        updatePinDots('pinSetup', _pinSetupBuffer.length);
        hapticFeedback('light');
    }
}

async function confirmPinSetup() {
    const messageDiv = document.getElementById('pinSetupMessage');
    if (_pinSetupSubmitting) return;
    if (!/^\d{4}$/.test(_pinSetupBuffer)) {
        messageDiv.innerHTML = '<div class="error">Enter all four digits.</div>';
        return;
    }
    _pinSetupSubmitting = true;
    setPinKeypadBusy('pinSetup', true);
    messageDiv.innerHTML = '<div class="pin-progress"><span class="loading-spinner" aria-hidden="true"></span><span>Saving your PIN…</span></div>';
    const data = await apiCall('setPlayerPin', { player_id: _pinSetupPlayerId, pin: _pinSetupBuffer });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">❌ ' +
            escapeHtml(apiErrorMessage(data, 'Could not save PIN. Please try again.')) + '</div>';
        _pinSetupBuffer = '';
        updatePinDots('pinSetup', 0);
        _pinSetupSubmitting = false;
        setPinKeypadBusy('pinSetup', false);
    } else {
        messageDiv.innerHTML = '<div class="success">✅ PIN set!</div>';
        const player = allPlayers.find(p => String(p.player_id) === String(_pinSetupPlayerId));
        if (player) player.has_pin = true;
        if (_currentProfileData && _currentProfileData.player &&
            String(_currentProfileData.player.player_id) === String(_pinSetupPlayerId)) {
            _currentProfileData.player.has_pin = true;
        }
        storeIdentity(_pinSetupPlayerId, data.username || (player && player.username) || 'Player');
        if (data.player_token) setPlayerToken(data.player_token);
        hapticFeedback('success');
        setTimeout(function() {
            const playerId = _pinSetupPlayerId;
            const callback = _pinSetupCallback;
            const openProfile = _pinSetupOpenProfile;
            _pinSetupSubmitting = false;
            setPinKeypadBusy('pinSetup', false);
            _pendingSignInResolver = null;
            closePinSetupModal();
            if (openProfile) openEditProfileModal(playerId);
            if (callback) callback();
        }, 800);
    }
}

// PIN Entry state
let _pinEntryBuffer = '';
let _pinEntryPlayerId = null;
let _pinEntryCallback = null;
let _pinEntrySubmitting = false;

function openPinEntryModal(playerId, callback) {
    _pinEntryPlayerId = playerId;
    _pinEntryCallback = callback;
    _pinEntryBuffer = '';
    _pinEntrySubmitting = false;
    setPinKeypadBusy('pinEntry', false);
    updatePinDots('pinEntry', 0);
    document.getElementById('pinEntryMessage').innerHTML = '';
    document.getElementById('pinEntryModal').classList.add('active');
    setTimeout(function() {
        const firstKey = document.querySelector('#pinEntryKeypad .pin-key:not(:disabled)');
        if (firstKey) firstKey.focus();
    }, 0);
}

function closePinEntryModal() {
    if (_pinEntrySubmitting) return;
    document.getElementById('pinEntryModal').classList.remove('active');
    _pinEntryBuffer = '';
    _pinEntryPlayerId = null;
    _pinEntryCallback = null;
    if (_pendingSignInResolver) _pendingSignInResolver('');
    _pendingSignInResolver = null;
}

function pinEntryInput(digit) {
    if (_pinEntrySubmitting || _pinEntryBuffer.length >= 4) return;
    _pinEntryBuffer += digit;
    updatePinDots('pinEntry', _pinEntryBuffer.length);
    hapticFeedback('light');
    if (_pinEntryBuffer.length === 4) {
        setTimeout(submitPinEntry, 200);
    }
}

function pinEntryClear() {
    if (_pinEntrySubmitting) return;
    if (_pinEntryBuffer.length > 0) {
        _pinEntryBuffer = _pinEntryBuffer.slice(0, -1);
        updatePinDots('pinEntry', _pinEntryBuffer.length);
        hapticFeedback('light');
    }
}

async function submitPinEntry() {
    const messageDiv = document.getElementById('pinEntryMessage');
    if (_pinEntrySubmitting) return;
    if (!/^\d{4}$/.test(_pinEntryBuffer)) {
        messageDiv.innerHTML = '<div class="error">Enter your four-digit PIN.</div>';
        return;
    }
    _pinEntrySubmitting = true;
    setPinKeypadBusy('pinEntry', true);
    messageDiv.innerHTML = '<div class="pin-progress"><span class="loading-spinner" aria-hidden="true"></span><span>Checking your PIN…</span></div>';
    const data = await apiCall('verifyPlayerPin', {
        player_id: _pinEntryPlayerId,
        pin: _pinEntryBuffer,
        device_id: getDeviceId()
    });
    if (data.error) {
        messageDiv.innerHTML = '<div class="error">❌ ' +
            escapeHtml(apiErrorMessage(data, 'Error verifying PIN.')) + '</div>';
        _pinEntryBuffer = '';
        updatePinDots('pinEntry', 0);
        _pinEntrySubmitting = false;
        setPinKeypadBusy('pinEntry', false);
        return;
    }
    if (data.success) {
        const player = allPlayers.find(p => String(p.player_id) === String(_pinEntryPlayerId));
        storeIdentity(_pinEntryPlayerId, data.username || (player && player.username) || 'Player');
        if (data.player_token) setPlayerToken(data.player_token);
        hapticFeedback('success');
        const cb = _pinEntryCallback;
        _pinEntrySubmitting = false;
        setPinKeypadBusy('pinEntry', false);
        _pendingSignInResolver = null;
        closePinEntryModal();
        if (cb) cb();
    } else {
        messageDiv.innerHTML = '<div class="error">❌ Incorrect PIN. Try again.</div>';
        hapticFeedback('error');
        _pinEntryBuffer = '';
        updatePinDots('pinEntry', 0);
        _pinEntrySubmitting = false;
        setPinKeypadBusy('pinEntry', false);
    }
}

// ============================================
// PLAYER PROFILES
// ============================================
let _currentProfileId = null;
let _currentProfileData = null;

function returnToPlayersFromProfile() {
    const intentId = showScreen('playersScreen');
    loadPlayersScreen(intentId);
}

function makePlayerLink(playerId, displayName, beforeNavigation, extraClass) {
    if (playerId === null || playerId === undefined || String(playerId) === '') return displayName;
    const className = 'player-link' + (extraClass ? ' ' + extraClass : '');
    const before = beforeNavigation ? beforeNavigation + ' ' : '';
    const player = allPlayers.find(function(item) {
        return String(item.player_id) === String(playerId);
    });
    const plainName = decodeHtml(String(player && player.username ? player.username : displayName || '')).trim();
    const initial = escapeHtml((plainName.charAt(0) || '?').toUpperCase());
    const avatarUrl = player && player.avatar_url ? String(player.avatar_url) : '';
    let avatarHtml;
    if (avatarUrl) {
        avatarHtml =
            '<span class="player-link-avatar-wrap" aria-hidden="true">' +
                '<img src="' + escapeAttr(avatarUrl) + '" class="player-link-avatar" alt="" loading="lazy" decoding="async" ' +
                    'onerror="this.hidden=true; this.nextElementSibling.hidden=false;">' +
                '<span class="player-link-avatar player-link-avatar-initial" hidden>' + initial + '</span>' +
            '</span>';
    } else {
        avatarHtml =
            '<span class="player-link-avatar-wrap" aria-hidden="true">' +
                '<span class="player-link-avatar player-link-avatar-initial">' + initial + '</span>' +
            '</span>';
    }
    return '<a href="#playerProfileScreen" class="' + className + '" onclick="' + before +
        'showPlayerProfile(\'' + escapeAttr(playerId) + '\'); return false;">' +
        avatarHtml + '<span class="player-link-name">' + displayName + '</span></a>';
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
    if (allPlayers.length > 0 && eloCache.length > 0) {
        renderPlayersDirectory(contentDiv);
        setTimeout(function() {
            if (!isCurrentNavigationIntent(intentId)) return;
            Promise.all([
                apiCall('getPlayers', {}, { forceRefresh: true }),
                apiCall('getEloRatings', {}, { forceRefresh: true })
            ]).then(function(results) {
                if (!results[0].error) applyPlayersData(results[0], Date.now());
                if (!results[1].error) eloCache = results[1];
                if (isCurrentNavigationIntent(intentId)) renderPlayersDirectory(contentDiv);
            });
        }, 250);
        return true;
    }
    await ensurePlayersLoaded();
    if (!isCurrentNavigationIntent(intentId)) return false;
    await loadEloRatings();
    if (!isCurrentNavigationIntent(intentId)) return false;
    return renderPlayersDirectory(contentDiv);
}

function renderPlayersDirectory(contentDiv) {
    if (allPlayers.length === 0) {
        contentDiv.innerHTML = '<div class="placeholder-content"><p>No players found.</p></div>';
        return false;
    }
    let html = '<div class="players-grid">';
    for (let i = 0; i < allPlayers.length; i++) {
        const p = allPlayers[i];
        const elo = getPlayerElo(p.player_id);
        const eloText = elo ? '⚡ ' + elo.rating + (elo.provisional ? '?' : '') : '';
        const avatarUrl = p.avatar_url || '';
        let avatarHtml;
        if (avatarUrl) {
            avatarHtml = '<img src="' + avatarUrl + '" class="player-card-avatar" alt="Profile photo for ' + escapeAttr(p.username) + '">';
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
    const storedProfile = loadStoredPlayerProfile(playerId);
    if (storedProfile) {
        _currentProfileData = reconcileProfileWithCurrentRating(storedProfile.data);
        renderPlayerProfile(_currentProfileData);
        if (Date.now() - Number(storedProfile.stored_at) < PROFILE_BACKGROUND_REFRESH_MS) return;
    } else {
        contentDiv.innerHTML =
            '<div class="skeleton-card">' +
                '<div class="shimmer-wrapper" style="height:120px; border-radius:12px; margin-bottom:20px;"></div>' +
                '<div class="shimmer-wrapper skeleton-text skeleton-w-100 mb-10" style="height:80px;"></div>' +
                '<div class="shimmer-wrapper skeleton-text skeleton-w-100 mb-10" style="height:120px;"></div>' +
            '</div>';
    }

    const data = await apiCall(
        'getPlayerProfile',
        { player_id: playerId },
        { forceRefresh: Boolean(storedProfile) }
    );
    if (!data.error) saveStoredPlayerProfile(playerId, data);
    if (!isCurrentNavigationIntent(intentId)) return;
    if (data.error) {
        if (!storedProfile) {
            contentDiv.innerHTML = loadErrorHtml(
                data,
                'This player profile could not be loaded.',
                'showPlayerProfile(' + Number(playerId) + ')'
            );
        }
        return;
    }
    const identity = getStoredIdentity();
    if (identity && String(identity.player_id) === String(playerId) &&
        data.player && data.player.has_pin === false) {
        signOutPlayer();
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
        avatarHtml = '<img src="' + p.avatar_url + '" class="profile-avatar" alt="Profile photo for ' + escapeAttr(p.username) + '" onclick="openPhotoFullscreen(\'' + p.avatar_url + '\')">';
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
    if (isOwnProfile && getPlayerToken()) {
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
            html += '<button type="button" class="h2h-summary-row" aria-label="Compare ' +
                escapeAttr(p.username) + ' with ' + escapeAttr(getPlayerName(h.opponent_id)) +
                '" onclick="quickCompare(' + _currentProfileId + ', ' + h.opponent_id + ')">';
            html += '<div class="h2h-summary-copy">';
            html += '<div class="h2h-summary-name">' + getPlayerName(h.opponent_id) + '</div>';
            html += '<div class="h2h-summary-record">' + h.wins + 'W – ' + h.ties + 'D – ' + h.losses + 'L • ' + formatCount(total, 'session') + '</div>';
            html += '</div>';
            html += '<div class="h2h-summary-bar">';
            html += '<div style="width:' + winPct + '%;background:#667eea;"></div>';
            html += '<div style="width:' + tiePct + '%;background:#aaa;"></div>';
            html += '<div style="width:' + lossPct + '%;background:#f5576c;"></div>';
            html += '</div>';
            html += '</button>';
        }
        html += '</div>';
    }

    // All sessions — scrollable and searchable
    if (data.recent_sessions && data.recent_sessions.length > 0) {
        const historicalEloStatusMap = Object.assign(
            {},
            buildHistoricalEloStatusMap(
                getCachedSessionsWithHands(),
                Array.isArray(eloHistoryAllCache) ? eloHistoryAllCache : []
            ),
            buildPlayerHistoricalEloStatusMap(p.player_id, data.recent_sessions, elo.history || [])
        );
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
                const displayedRating = formatHistoricalEloRating(s.elo_after, s.session_id, p.player_id, historicalEloStatusMap);
                eloHtml = ' <span class="elo-badge" style="font-size:0.72em;">⚡ ' + displayedRating + '</span>' +
                          ' <span style="color:' + eloChangeColor + ';font-weight:600;font-size:0.78em;">(' + eloChangeStr + ')</span>' +
                          formatEstablishedThisGameBadge(s.session_id, p.player_id, historicalEloStatusMap);
            }
            html += '<div class="profile-session-row" data-title="' + escapeAttr(s.title) + '" onclick="viewSessionFromProfileWithLoading(this, \'' + s.session_id + '\')">';
            html += '<div style="flex:1;min-width:0;">';
            html += '<div class="profile-session-title">' + s.title + '</div>';
            html += '<div class="profile-session-meta">' + cleanDate + ' • ' +
                formatCount(s.hand_count, 'hand') + ' • ' +
                formatCount(s.player_count, 'player') + ' • ' +
                formatPoints(s.player_score) + eloHtml + '</div>';
            html += '</div>';
            const resultClass = s.won ? 'won' : (s.tied ? 'tied' : 'lost');
            const resultLabel = s.won ? '🏆 Win' : (s.tied ? '🤝 Tie' : 'Loss');
            html += '<div class="profile-session-result ' + resultClass + '">' + resultLabel + '</div>';
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
        { key: 'marksman',           emoji: '🎯',  name: 'Marksman',           live: true,  desc: 'Avg LO ≤ 1.0 (25+ lockout attempts)' },
        { key: 'surgeon',            emoji: '🔬',  name: 'Surgeon',            live: true,  desc: 'Avg LO ≤ 0.0 (25+ lockout attempts)' },
        { key: 'ice_veins',          emoji: '🧊',  name: 'Ice Veins',          live: true,  desc: 'Avg LO ≤ -1.0 (25+ lockout attempts)' },
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
        marksman:           { emoji: '🎯',  name: 'Marksman',           live: true,  desc: 'Average declaration score of 1.0 or under (minimum 25 lockout attempts)' },
        surgeon:            { emoji: '🔬',  name: 'Surgeon',            live: true,  desc: 'Average declaration score of 0.0 or under (minimum 25 lockout attempts)' },
        ice_veins:          { emoji: '🧊',  name: 'Ice Veins',          live: true,  desc: 'Average declaration score of -1.0 or under (minimum 25 lockout attempts)' },
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
    if (!window.Chart) {
        loadChartLibrary().then(function() { drawProfileEloChart(history); }).catch(function() {});
        return;
    }
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
        Boolean(getPlayerToken());
    if (!alreadyVerified) {
        alert('Sign in as ' + _currentProfileData.player.username + ' to edit this profile.');
        return;
    }

    if (_currentProfileData.player.has_pin === false) {
        signOutPlayer();
        alert('Your PIN needs to be set again. Sign in from the header to continue.');
        return;
    }
    openEditProfileModal(playerId);
}

function openEditProfileModal(playerId) {
    if (!_currentProfileData) return;
    const identity = getStoredIdentity();
    if (!identity || !getPlayerToken() ||
        String(identity.player_id) !== String(playerId) ||
        String(_currentProfileData.player.player_id) !== String(playerId)) {
        alert('Sign in as this player to edit the profile.');
        return;
    }
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
