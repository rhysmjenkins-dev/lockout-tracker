// Haptic Feedback
function hapticFeedback(style) {
    if ('vibrate' in navigator) {
        const patterns = {
            light: 10,
            medium: 20,
            heavy: 50,
            success: [10, 50, 10],
            error: [50, 100, 50]
        };
        navigator.vibrate(patterns[style] || 15);
    }
}

// Confetti Celebration
function celebrateWinner(winnerName) {
    const duration = 3000;
    const end = Date.now() + duration;
    
    (function frame() {
        confetti({
            particleCount: 3,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#667eea', '#764ba2', '#f5576c']
        });
        confetti({
            particleCount: 3,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#667eea', '#764ba2', '#f5576c']
        });
        
        if (Date.now() < end) {
            requestAnimationFrame(frame);
        }
    }());
}

// Button Loading State
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

// Date Formatting
function formatDate(dateString) {
    const dateObj = new Date(dateString);
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const year = dateObj.getFullYear();
    return `${month}/${day}/${year}`;
}

// Parse Player Join Info
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
    } catch(e) {
        return {};
    }
}

// Get Player Starting Score
function getPlayerStartingScore(playerId, session) {
    if (!session || !session.player_join_info) return 0;
    try {
        const fullInfo = JSON.parse(session.player_join_info);
        const info = fullInfo[playerId];
        if (!info) return 0;
        if (typeof info === 'object' && info.starting_score !== undefined) {
            return info.starting_score;
        }
    } catch(e) {}
    return 0;
}

// Get Player Join Hand
function getPlayerJoinHand(playerId, session) {
    if (!session || !session.player_join_info) return 1;
    const joinInfo = parsePlayerJoinInfo(session.player_join_info);
    return joinInfo[playerId] || 1;
}

// Get Player Name
function getPlayerName(playerId, playerCache) {
    return playerCache[playerId] || 'Unknown';
}
