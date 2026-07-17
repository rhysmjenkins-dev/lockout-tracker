// Session Management
let currentSession = null;
let sessionPlayers = [];
let allSessions = [];

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
}

async function createSession() {
  const title = document.getElementById('sessionTitle').value.trim();
  const hostId = document.getElementById('sessionHost').value;
  const checkboxes = document.querySelectorAll('.player-checkbox:checked');
  const selectedPlayers = [];
  for (let i = 0; i < checkboxes.length; i++) {
    selectedPlayers.push(checkboxes[i].value);
  }
  const notes = document.getElementById('sessionNotes').value.trim();
  const tagsSelect = document.getElementById('sessionTags');
  const selectedTags = [];
  for (let i = 0; i < tagsSelect.options.length; i++) {
    if (tagsSelect.options[i].selected) {
      selectedTags.push(tagsSelect.options[i].value);
    }
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
  
  const data = await apiCall('createSession', {
    title: title,
    host_player_id: hostId,
    players_involved: selectedPlayers.join(','),
    notes: notes,
    tags: tags,
    false_lockout_penalty: penalty
  });
  
  if (data.error) {
    messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
    setButtonLoading(createBtn, false);
  } else {
    currentSession = { 
      session_id: data.session_id, 
      title: title, 
      host_player_id: hostId,
      notes: notes,
      tags: tags,
      player_join_info: '{}',
      players_involved: selectedPlayers.join(','),
      false_lockout_penalty: penalty
    };
    sessionPlayers = [];
    for (let i = 0; i < allPlayers.length; i++) {
      if (selectedPlayers.indexOf(String(allPlayers[i].player_id)) !== -1) {
        sessionPlayers.push(allPlayers[i]);
      }
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
  if (buttonElement) {
    setButtonLoading(buttonElement, true);
  }
  
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
    session_id: sessionData.session_id,
    title: sessionData.title,
    host_player_id: sessionData.host_player_id,
    notes: sessionData.notes || '',
    tags: sessionData.tags || '',
    player_join_info: sessionData.player_join_info || '{}',
    players_involved: sessionData.players_involved,
    false_lockout_penalty: sessionData.false_lockout_penalty || 10
  };
  
  const handsData = await apiCall('getHands', { session_id: sessionId });
  if (handsData.error || handsData.length === 0) {
    currentHandNumber = 1;
  } else {
    currentHandNumber = Math.max(...handsData.map(h => h.hand_number)) + 1;
  }
  
  showActiveSession();
  updateSessionScores();
  
  if (buttonElement) setButtonLoading(buttonElement, false);
}

function showActiveSession() {
  document.getElementById('activeSessionTitle').textContent = currentSession.title;
  let playerNames = sessionPlayers.map(p => {
    const joinHand = getPlayerJoinHand(p.player_id);
    if (joinHand > 1) {
      return p.username + ' <span class="late-join-badge">Joined H' + joinHand + '</span>';
    }
    return p.username;
  }).join(', ');
  document.getElementById('activeSessionInfo').innerHTML = 
    '<p><strong>Session ID:</strong> ' + currentSession.session_id + '</p>' +
    '<p><strong>Players:</strong> ' + playerNames + '</p>';
  displaySessionMetadata('activeSessionMetadata');
  setupHandInputs();
  
  document.getElementById('sessionScores').innerHTML = '';
  document.getElementById('handHistorySection').style.display = 'none';
  document.getElementById('activeSessionCharts').innerHTML = '';
  
  updateSessionScores();
  
  showScreen('activeSessionScreen');
}

function displaySessionMetadata(containerId) {
  const container = document.getElementById(containerId);
  if (!currentSession) return;
  let html = '';
  if (currentSession.notes || currentSession.tags) {
    html += '<div class="session-metadata">';
    if (currentSession.notes) {
      html += '<p><strong>📝 Notes:</strong> ' + currentSession.notes + '</p>';
    }
    if (currentSession.tags) {
      const tagsArray = currentSession.tags.split(',').filter(t => t.trim());
      if (tagsArray.length > 0) {
        html += '<p><strong>🏷️ Tags:</strong> ';
        for (let i = 0; i < tagsArray.length; i++) {
          html += '<span class="tag-badge">' + tagsArray[i] + '</span>';
        }
        html += '</p>';
      }
    }
    html += '</div>';
  }
  container.innerHTML = html;
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
    alert('Error: ' + data.error);
    setButtonLoading(endBtn, false);
  } else {
    const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
    const playerTotals = {};
    
    for (let i = 0; i < sessionPlayers.length; i++) {
      const player = sessionPlayers[i];
      const startingScore = getPlayerStartingScore(player.player_id);
      playerTotals[player.player_id] = {
        username: player.username,
        total: startingScore
      };
    }
    
    for (let i = 0; i < handsData.length; i++) {
      const hand = handsData[i];
      if (playerTotals[hand.player_id]) {
        playerTotals[hand.player_id].total += Number(hand.score);
      }
    }
    
    const scores = Object.values(playerTotals).sort((a, b) => a.total - b.total);
    const winner = scores[0];
    const isTie = scores.length > 1 && scores[1].total === winner.total;
    
    const winnerText = isTie ? 'Tie game!' : winner.username + ' wins!';
    
    alert('Session ended!\n\n🏆 ' + winnerText + ' (' + winner.total + ' pts)');
    hapticFeedback('success');
    
    if (!isTie) {
      celebrateWinner(winner.username);
    }
    
    currentSession = null;
    showScreen('homeScreen');
    checkActiveSessions();
  }
}

// Session Modals & Player Management

function showEditSessionModal() {
  document.getElementById('editSessionNotes').value = currentSession.notes || '';
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
    if (tagsSelect.options[i].selected) {
      selectedTags.push(tagsSelect.options[i].value);
    }
  }
  const tags = selectedTags.join(',');
  const saveBtn = event.target;
  setButtonLoading(saveBtn, true);
  
  let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
  const data = await apiCall('updateSession', {
    session_id: currentSession.session_id,
    notes: notes,
    tags: tags,
    editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
  });
  const messageDiv = document.getElementById('editSessionMessage');
  if (data.error) {
    messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
    setButtonLoading(saveBtn, false);
  } else {
    currentSession.notes = notes;
    currentSession.tags = tags;
    messageDiv.innerHTML = '<div class="success">Session updated!</div>';
    displaySessionMetadata('activeSessionMetadata');
    setTimeout(function() {
      closeEditSessionModal();
      setButtonLoading(saveBtn, false);
    }, 1000);
  }
}

function closeEditSessionModal() {
  document.getElementById('editSessionModal').classList.remove('active');
  document.getElementById('editSessionMessage').innerHTML = '';
}

// Add Player to Session

let selectedPlayerToAdd = null;

async function showAddPlayerModal() {
  await ensurePlayersLoaded();
  const currentPlayerIds = sessionPlayers.map(p => String(p.player_id));
  const availablePlayers = allPlayers.filter(p => currentPlayerIds.indexOf(String(p.player_id)) === -1);
  if (availablePlayers.length === 0) {
    alert('All players are already in this session!');
    return;
  }
  const playerList = document.getElementById('addPlayerList');
  let html = '<ul class="player-list">';
  for (let i = 0; i < availablePlayers.length; i++) {
    const player = availablePlayers[i];
    html += '<li class="player-item">';
    html += '<label><input type="radio" name="addPlayerRadio" value="' + player.player_id + '" onchange="selectPlayerToAdd(' + player.player_id + ', \'' + player.username + '\')"> ' + player.username + '</label>';
    html += '</li>';
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
  
  if (addBtn) {
    setButtonLoading(addBtn, true);
  }
  
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
    messageDiv.innerHTML = '<div class="success">Player added successfully!' + 
      (startingScore > 0 ? ' (Starting with ' + startingScore + ' points)' : '') + 
      '</div>';
    currentSession.players_involved = data.players_involved;
    currentSession.player_join_info = data.player_join_info;
    const newPlayer = allPlayers.find(p => String(p.player_id) === String(selectedPlayerToAdd));
    if (newPlayer) {
      sessionPlayers.push(newPlayer);
    }
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

// Add New Player

async function addPlayer() {
  const username = document.getElementById('newPlayerName').value.trim();
  const messageDiv = document.getElementById('addPlayerMessage');
  
  if (!username) {
    messageDiv.innerHTML = '<div class="error">Please enter a player name</div>';
    return;
  }
  
  const addBtn = event.target;
  setButtonLoading(addBtn, true);
  
  const data = await apiCall('addPlayer', { username: username, editor_name: username });
  
  if (data.error) {
    messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
    setButtonLoading(addBtn, false);
  } else {
    messageDiv.innerHTML = '<div class="success">Player added!</div>';
    document.getElementById('newPlayerName').value = '';
    playersLoaded = false;
    setTimeout(function() { 
      showScreen('homeScreen'); 
      setButtonLoading(addBtn, false);
    }, 1500);
  }
}

// Check Active Sessions

async function checkActiveSessions() {
  document.getElementById('activeSessionsSection').innerHTML = 
    '<div class="skeleton-card">' +
      '<h3 style="color: #667eea; margin-bottom: 15px;">Loading active sessions...</h3>' +
      '<div class="shimmer-wrapper skeleton-text large" style="width: 60%;"></div>' +
      '<div class="shimmer-wrapper skeleton-text" style="width: 80%; margin-top: 15px;"></div>' +
      '<div class="shimmer-wrapper skeleton-text" style="width: 70%;"></div>' +
      '<div class="shimmer-wrapper skeleton-button" style="margin-top: 15px;"></div>' +
    '</div>';
  
  const sessionsData = await apiCall('getSessions', {});
  if (sessionsData.error) {
    document.getElementById('activeSessionsSection').innerHTML = '<p style="color: #c33;">Error loading sessions</p>';
    return;
  }
  const activeSessions = sessionsData.filter(s => {
    const dateEnded = s.date_ended;
    return !dateEnded || dateEnded === '' || dateEnded.toString().trim() === '';
  });
  
  if (activeSessions.length > 0) {
    let html = '<div class="active-session-box">';
    html += '<h3>Active Sessions</h3>';
    html += '<div style="max-height: 400px; overflow-y: auto; padding-right: 5px;">';
    
    for (let i = 0; i < activeSessions.length; i++) {
      const session = activeSessions[i];
      const handsData = await apiCall('getHands', { session_id: session.session_id });
      const handCount = handsData.error ? 0 : (handsData.length > 0 ? Math.max(...handsData.map(h => h.hand_number)) : 0);
      
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
      
      if (!handsData.error) {
        for (let h = 0; h < handsData.length; h++) {
          const hand = handsData[h];
          if (playerScores[hand.player_id] !== undefined) {
            playerScores[hand.player_id] += Number(hand.score);
          }
          if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
            if (hand.false_lockout == 1 || hand.false_lockout === true) {
              playerFalseLockouts[hand.player_id]++;
            } else {
              playerLockouts[hand.player_id]++;
            }
          }
        }
      }
      
      let leaderId = null;
      let lowestScore = Infinity;
      for (let pid in playerScores) {
        if (playerScores[pid] < lowestScore) {
          lowestScore = playerScores[pid];
          leaderId = pid;
        }
      }
      
      const startTime = new Date(session.date_started);
      const now = new Date();
      const elapsed = now - startTime;
      const hours = Math.floor(elapsed / 3600000);
      const minutes = Math.floor((elapsed % 3600000) / 60000);
      const timeStr = hours > 0 ? hours + 'h ' + minutes + 'm' : minutes + 'm';
      
      html += '<div class="active-session-item" style="background: white; padding: 20px; border-radius: 12px; margin: 12px 0; border: 2px solid #e8e9ff; box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);">';
      html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; gap: 15px; padding-bottom: 12px; border-bottom: 2px solid #f0f0f0;">';
      html += '<div style="flex: 1;"><strong style="font-size: 1.15em; color: #667eea;">🎮 ' + session.title + '</strong></div>';
      html += '<button class="btn btn-success btn-small" onclick="resumeSession(' + session.session_id + ', this)" style="margin: 0; flex-shrink: 0; padding: 8px 16px; font-size: 0.9em;">Resume</button>';
      html += '</div>';

      html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">';
      html += '<div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 0.85em;">';
      html += '<div style="color: #999; font-size: 0.75em; margin-bottom: 3px;">🎴 HAND</div>';
      html += '<div style="color: #333; font-weight: 600;">' + handCount + '</div>';
      html += '</div>';
      html += '<div style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 0.85em;">';
      html += '<div style="color: #999; font-size: 0.75em; margin-bottom: 3px;">👥 PLAYERS</div>';
      html += '<div style="color: #333; font-weight: 600;">' + playerIds.length + '</div>';
      html += '</div>';
      html += '</div>';

      if (leaderId) {
        html += '<div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 3px solid #4caf50;">';
        html += '<div style="font-size: 0.85em; color: #2e7d32; font-weight: 600;">🏆 ' + getPlayerName(leaderId) + ' leading</div>';
        html += '<div style="font-size: 0.9em; color: #1b5e20; font-weight: bold; margin-top: 3px;">' + playerScores[leaderId] + ' points</div>';
        html += '</div>';
      }

      for (let pid in playerLockouts) {
        if (playerLockouts[pid] >= 2) {
          html += '<div style="background: #fff3e0; padding: 8px 12px; border-radius: 6px; font-size: 0.85em; color: #e65100; border-left: 3px solid #ff9800; margin-top: 8px;">';
          html += '🔥 <strong>' + getPlayerName(pid) + ':</strong> ' + playerLockouts[pid] + ' lockout streak';
          html += '</div>';
        }
      }

      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
    document.getElementById('activeSessionsSection').innerHTML = html;
  } else {
    document.getElementById('activeSessionsSection').innerHTML = '';
  }
}
