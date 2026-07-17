// Utility Functions

function getPlayerName(playerId) {
  if (playerCache[playerId]) {
    return playerCache[playerId];
  }
  for (let i = 0; i < allPlayers.length; i++) {
    if (allPlayers[i].player_id == playerId) {
      return allPlayers[i].username;
    }
  }
  return 'Unknown';
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
  } catch(e) {
    return {};
  }
}

function getPlayerStartingScore(playerId) {
  if (!currentSession || !currentSession.player_join_info) return 0;
  try {
    const fullInfo = JSON.parse(currentSession.player_join_info);
    const info = fullInfo[playerId];
    if (!info) return 0;
    if (typeof info === 'object' && info.starting_score !== undefined) {
      return info.starting_score;
    }
  } catch(e) {}
  return 0;
}

function getPlayerJoinHand(playerId) {
  if (!currentSession || !currentSession.player_join_info) return 1;
  const joinInfo = parsePlayerJoinInfo(currentSession.player_join_info);
  return joinInfo[playerId] || 1;
}

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

function hapticFeedback(style) {
  if ('vibrate' in navigator) {
    switch(style) {
      case 'light':
        navigator.vibrate(10);
        break;
      case 'medium':
        navigator.vibrate(20);
        break;
      case 'heavy':
        navigator.vibrate(50);
        break;
      case 'success':
        navigator.vibrate([10, 50, 10]);
        break;
      case 'error':
        navigator.vibrate([50, 100, 50]);
        break;
      default:
        navigator.vibrate(15);
    }
  }
}

function celebrateWinner(winnerName) {
  const duration = 3000;
  const end = Date.now() + duration;
  
  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: CONFIG.CHART_COLORS
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: CONFIG.CHART_COLORS
    });
    
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
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
    setTimeout(function() {
      document.body.removeChild(message);
    }, 500);
  }, 3000);
}
