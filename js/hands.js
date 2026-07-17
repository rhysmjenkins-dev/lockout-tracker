// Hand Management
let currentHandNumber = 1;
let currentEditingHand = null;

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
  
  if (!lockoutRadio) {
    warningDiv.style.display = 'none';
    return;
  }
  
  const lockoutPlayerId = lockoutRadio.value;
  const scores = [];
  let allScoresEntered = true;
  
  for (let i = 0; i < sessionPlayers.length; i++) {
    const player = sessionPlayers[i];
    const joinHand = getPlayerJoinHand(player.player_id);
    if (joinHand <= currentHandNumber) {
      const scoreInput = document.getElementById('score_' + player.player_id);
      const scoreVal = scoreInput.value.trim();
      if (scoreVal === '') {
        allScoresEntered = false;
        break;
      }
      scores.push({ player_id: player.player_id, score: parseFloat(scoreVal) });
    }
  }
  
  if (!allScoresEntered) {
    warningDiv.style.display = 'none';
    return;
  }
  
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
      if (scoreVal === '') {
        messageDiv.innerHTML = '<div class="error">Please enter all scores</div>';
        setButtonLoading(submitBtn, false);
        return;
      }
      const scoreNum = parseFloat(scoreVal);
      if (scoreNum < -2) {
        messageDiv.innerHTML = '<div class="error">Minimum score is -2 (two Red Kings)</div>';
        hapticFeedback('error');
        setButtonLoading(submitBtn, false);
        return;
      }
      scores.push({ player_id: player.player_id, score: scoreNum });
    }
  }
  
  const lockoutPlayerScore = scores.find(s => String(s.player_id) === String(lockoutPlayerId)).score;
  const lowestScore = Math.min(...scores.map(s => s.score));
  const playersWithLowestScore = scores.filter(s => s.score === lowestScore);
  const hasStrictlyLowestScore = (lockoutPlayerScore === lowestScore && playersWithLowestScore.length === 1);
  
  let falseLockout = (lockoutPlayerScore > 5) || !hasStrictlyLowestScore;
  
  if (document.getElementById('lockoutWarning').style.display === 'block') {
    const confirmMsg = 'This will be marked as a FALSE LOCKOUT. Continue?';
    if (!confirm(confirmMsg)) {
      setButtonLoading(submitBtn, false);
      return;
    }
  }
  
  let penalty = 10;
  if (currentSession.false_lockout_penalty) {
    penalty = Number(currentSession.false_lockout_penalty);
  }
  
  const lockoutScoreValue = lockoutPlayerScore;
  
  for (let i = 0; i < scores.length; i++) {
    if (String(scores[i].player_id) === String(lockoutPlayerId)) {
      if (falseLockout) {
        scores[i].score = lockoutScoreValue + penalty;
      } else {
        scores[i].score = lockoutScoreValue < 0 ? lockoutScoreValue : 0;
      }
      break;
    }
  }

  const comment = document.getElementById('handComment').value.trim();
  let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
  const data = await apiCall('addHand', {
    session_id: currentSession.session_id,
    hand_number: currentHandNumber,
    scores: JSON.stringify(scores),
    lockout_player_id: lockoutPlayerId,
    false_lockout: falseLockout,
    editor_name: hostPlayer ? hostPlayer.username : 'Unknown',
    comment: comment,
    lockout_score: lockoutScoreValue
  });
  
  if (data.error) {
    messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
    setButtonLoading(submitBtn, false);
  } else {
    currentHandNumber++;
    hapticFeedback('success');
    setupHandInputs();
    updateSessionScores();
    setButtonLoading(submitBtn, false);
  }
}

async function editHand(handNumber, event) {
  if (event && event.target) {
    setButtonLoading(event.target, true);
  }

  const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
  const handsToEdit = handsData.filter(h => h.hand_number == handNumber);
  if (handsToEdit.length === 0) {
    alert('Hand not found');
    return;
  }
  
  currentEditingHand = handNumber;
  document.getElementById('editHandNumber').textContent = handNumber;
  document.getElementById('editLockoutWarning').style.display = 'none';
  let html = '';
  let lockoutPlayerId = null;
  let isFalseLockout = false;
  let handComment = '';
  
  for (let i = 0; i < handsToEdit.length; i++) {
    const hand = handsToEdit[i];
    if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
      lockoutPlayerId = hand.player_id;
      isFalseLockout = (hand.false_lockout == 1 || hand.false_lockout === true);
    }
    if (hand.comment && !handComment) {
      handComment = hand.comment;
    }
  }
  
  for (let i = 0; i < sessionPlayers.length; i++) {
    const player = sessionPlayers[i];
    const joinHand = getPlayerJoinHand(player.player_id);
    if (joinHand <= handNumber) {
      const handData = handsToEdit.find(h => String(h.player_id) === String(player.player_id));
      let displayScore = '';
      if (handData) {
        if (lockoutPlayerId && String(lockoutPlayerId) === String(player.player_id)) {
          displayScore = handData.lockout_score ? handData.lockout_score : handData.score;
        } else {
          displayScore = handData.score;
        }
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
  
  if (event && event.target) {
    setButtonLoading(event.target, false);
  }
}

function checkEditLockoutValidity() {
  const warningDiv = document.getElementById('editLockoutWarning');
  const lockoutRadio = document.querySelector('input[name="edit_lockout_player"]:checked');
  
  if (!lockoutRadio) {
    warningDiv.style.display = 'none';
    return;
  }
  
  const lockoutPlayerId = lockoutRadio.value;
  const scores = [];
  let allScoresEntered = true;
  
  for (let i = 0; i < sessionPlayers.length; i++) {
    const player = sessionPlayers[i];
    const joinHand = getPlayerJoinHand(player.player_id);
    if (joinHand <= currentEditingHand) {
      const scoreInput = document.getElementById('edit_score_' + player.player_id);
      const scoreVal = scoreInput.value.trim();
      if (scoreVal === '') {
        allScoresEntered = false;
        break;
      }
      scores.push({ player_id: player.player_id, score: parseFloat(scoreVal) });
    }
  }
  
  if (!allScoresEntered) {
    warningDiv.style.display = 'none';
    return;
  }
  
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
  
  if (!lockoutRadio) {
    messageDiv.innerHTML = '<div class="error">Please select who locked out</div>';
    setButtonLoading(saveBtn, false);
    return;
  }
  
  const lockoutPlayerId = lockoutRadio.value;
  
  for (let i = 0; i < sessionPlayers.length; i++) {
    const player = sessionPlayers[i];
    const joinHand = getPlayerJoinHand(player.player_id);
    if (joinHand <= currentEditingHand) {
      const scoreInput = document.getElementById('edit_score_' + player.player_id);
      const scoreVal = scoreInput.value.trim();
      if (scoreVal === '') {
        messageDiv.innerHTML = '<div class="error">Please enter all scores</div>';
        setButtonLoading(saveBtn, false);
        return;
      }
      const scoreNum = parseFloat(scoreVal);
      if (scoreNum < -2) {
        messageDiv.innerHTML = '<div class="error">Minimum score is -2 (two Red Kings)</div>';
        hapticFeedback('error');
        setButtonLoading(saveBtn, false);
        return;
      }
      scores.push({ player_id: player.player_id, score: scoreNum });
    }
  }
  
  const lockoutPlayerScore = scores.find(s => String(s.player_id) === String(lockoutPlayerId)).score;
  const lowestScore = Math.min(...scores.map(s => s.score));
  const playersWithLowestScore = scores.filter(s => s.score === lowestScore);
  const hasStrictlyLowestScore = (lockoutPlayerScore === lowestScore && playersWithLowestScore.length === 1);
  
  let falseLockout = !hasStrictlyLowestScore;
  
  if (document.getElementById('editLockoutWarning').style.display === 'block') {
    const confirmMsg = 'This will be marked as a FALSE LOCKOUT. Continue?';
    if (!confirm(confirmMsg)) {
      setButtonLoading(saveBtn, false);
      return;
    }
  }
  
  let penalty = 10;
  if (currentSession.false_lockout_penalty) {
    penalty = Number(currentSession.false_lockout_penalty);
  }
  
  const lockoutScoreValue = lockoutPlayerScore;
  
  for (let i = 0; i < scores.length; i++) {
    if (String(scores[i].player_id) === String(lockoutPlayerId)) {
      if (falseLockout) {
        scores[i].score = lockoutScoreValue + penalty;
      } else {
        scores[i].score = lockoutScoreValue < 0 ? lockoutScoreValue : 0;
      }
      break;
    }
  }
  
  const comment = document.getElementById('editHandComment').value.trim();
  let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
  const data = await apiCall('updateHand', {
    session_id: currentSession.session_id,
    hand_number: currentEditingHand,
    scores: JSON.stringify(scores),
    lockout_player_id: lockoutPlayerId,
    false_lockout: falseLockout,
    editor_name: hostPlayer ? hostPlayer.username : 'Unknown',
    comment: comment,
    lockout_score: lockoutScoreValue
  });
  
  if (data.error) {
    messageDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
    setButtonLoading(saveBtn, false);
  } else {
    messageDiv.innerHTML = '<div class="success">Hand updated!</div>';
    setTimeout(function() {
      closeEditModal();
      updateSessionScores();
      setButtonLoading(saveBtn, false);
    }, 1000);
  }
}

function closeEditModal() {
  document.getElementById('editHandModal').classList.remove('active');
  document.getElementById('editHandMessage').innerHTML = '';
  currentEditingHand = null;
}

async function deleteHand(handNumber, event) {
  if (!confirm('Delete Hand ' + handNumber + '? This cannot be undone.')) {
    return;
  }
  if (event && event.target) {
    const deleteBtn = event.target;
    setButtonLoading(deleteBtn, true);
  }
  
  let hostPlayer = allPlayers.find(p => p.player_id == currentSession.host_player_id);
  const data = await apiCall('deleteHand', {
    session_id: currentSession.session_id,
    hand_number: handNumber,
    editor_name: hostPlayer ? hostPlayer.username : 'Unknown'
  });
  
  if (data.error) {
    alert('Error: ' + data.error);
    if (event && event.target) {
      setButtonLoading(event.target, false);
    }
  } else {
    if (handNumber == currentHandNumber - 1) {
      currentHandNumber--;
      setupHandInputs();
    }
    updateSessionScores();
    if (event && event.target) {
      setButtonLoading(event.target, false);
    }
  }
}

async function displayHandHistory() {
  const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
  if (handsData.error || handsData.length === 0) {
    document.getElementById('handHistorySection').style.display = 'none';
    return;
  }
  
  const handsByNumber = {};
  for (let i = 0; i < handsData.length; i++) {
    const hand = handsData[i];
    if (!handsByNumber[hand.hand_number]) {
      handsByNumber[hand.hand_number] = [];
    }
    handsByNumber[hand.hand_number].push(hand);
  }
  
  const handNumbers = Object.keys(handsByNumber).sort((a, b) => b - a);
  let html = '';
  
  for (let i = 0; i < handNumbers.length; i++) {
    const handNum = handNumbers[i];
    const hands = handsByNumber[handNum];
    let scoreText = '';
    let lockoutPlayer = '';
    let isFalseLockout = false;
    let handComment = '';
    
    for (let j = 0; j < hands.length; j++) {
      const h = hands[j];
      if (h.lockout_player_id && String(h.lockout_player_id) === String(h.player_id)) {
        if (h.lockout_score) {
          if (h.false_lockout == 1 || h.false_lockout === true) {
            const penalty = h.score - h.lockout_score;
            scoreText += getPlayerName(h.player_id) + ': ' + h.score + ' (' + h.lockout_score + ' + ' + penalty + ' penalty) | ';
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
      if (h.comment && !handComment) {
        handComment = h.comment;
      }
    }
    scoreText = scoreText.slice(0, -3);
    
    html += '<div class="hand-item">';
    html += '<div class="hand-item-info">';
    html += '<strong>Hand ' + handNum + '</strong><br>';
    html += '<small>' + scoreText + '</small><br>';
    html += '<small>Lockout: ' + lockoutPlayer + (isFalseLockout ? ' (FALSE)' : '') + '</small>';
    if (handComment) {
      html += '<br><small style="color: #667eea;">💬 ' + handComment + '</small>';
    }
    html += '</div>';
    html += '<div class="hand-item-actions">';
    html += '<button class="btn btn-warning btn-small" onclick="editHand(' + handNum + ', event)">Edit</button>';
    if (i === 0) {
      html += '<button class="btn btn-danger btn-small" onclick="deleteHand(' + handNum + ', event)">Delete</button>';
    }
    html += '</div>';
    html += '</div>';
  }
  
  document.getElementById('handHistoryList').innerHTML = html;
  document.getElementById('handHistorySection').style.display = 'block';
}

async function updateSessionScores() {
  // Skeleton loading state
  document.getElementById('sessionScores').innerHTML = 
    '<div class="skeleton-card">' +
      '<h3 style="color: #667eea; margin-bottom: 20px;">Calculating scores...</h3>' +
      '<div style="overflow-x: auto;">' +
        '<div class="skeleton-table-row">' +
          '<div class="shimmer-wrapper skeleton-table-cell"></div>' +
          '<div class="shimmer-wrapper skeleton-table-cell"></div>' +
          '<div class="shimmer-wrapper skeleton-table-cell"></div>' +
          '<div class="shimmer-wrapper skeleton-table-cell"></div>' +
          '<div class="shimmer-wrapper skeleton-table-cell"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  
  document.getElementById('handHistorySection').style.display = 'block';
  document.getElementById('handHistoryList').innerHTML = 
    '<div style="padding: 10px;">' +
      '<h4 style="color: #667eea; margin-bottom: 15px;">Loading hand history...</h4>' +
      '<div class="hand-item" style="background: #f8f9fa;">' +
        '<div class="hand-item-info" style="flex: 1;">' +
          '<div class="shimmer-wrapper skeleton-text" style="width: 30%; margin-bottom: 8px;"></div>' +
          '<div class="shimmer-wrapper skeleton-text small" style="width: 80%;"></div>' +
        '</div>' +
        '<div class="shimmer-wrapper skeleton-button" style="width: 80px; height: 40px;"></div>' +
      '</div>' +
    '</div>';
  
  const handsData = await apiCall('getHands', { session_id: currentSession.session_id });
  if (handsData.error) return;
  
  displayHandHistory();
  
  const playerScores = {};
  let totalLockoutScore = 0;
  let totalLockouts = 0;
  let falseLockoutCount = 0;
  
  for (let i = 0; i < sessionPlayers.length; i++) {
    const player = sessionPlayers[i];
    const startingScore = getPlayerStartingScore(player.player_id);
    playerScores[player.player_id] = {
      username: player.username,
      total: startingScore,
      hands: [],
      lockouts: 0,
      lockoutScores: [],
      falseLockouts: 0,
      totalLockouts: 0,
      joinHand: getPlayerJoinHand(player.player_id),
      startingScore: startingScore
    };
  }
  
  for (let i = 0; i < handsData.length; i++) {
    const hand = handsData[i];
    if (playerScores[hand.player_id]) {
      playerScores[hand.player_id].total += Number(hand.score);
      playerScores[hand.player_id].hands.push({
        hand_number: hand.hand_number,
        score: hand.score
      });
      
      if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
        playerScores[hand.player_id].totalLockouts++;
        if (hand.false_lockout == 1 || hand.false_lockout === true) {
          falseLockoutCount++;
          playerScores[hand.player_id].falseLockouts++;
        } else {
          playerScores[hand.player_id].lockouts++;
          const lockoutScoreToUse = hand.lockout_score ? Number(hand.lockout_score) : Number(hand.score);
          playerScores[hand.player_id].lockoutScores.push(lockoutScoreToUse);
          totalLockoutScore += lockoutScoreToUse;
          totalLockouts++;
        }
      }
    }
  }
  
  const scores = Object.values(playerScores).sort((a, b) => a.total - b.total);
  const leader = scores[0];
  const lastPlace = scores[scores.length - 1];
  const biggestGap = lastPlace.total - leader.total;
  
  let mostLockoutsPlayer = { username: 'None', lockouts: 0 };
  for (let i = 0; i < scores.length; i++) {
    if (scores[i].lockouts > mostLockoutsPlayer.lockouts) {
      mostLockoutsPlayer = { username: scores[i].username, lockouts: scores[i].lockouts };
    }
  }
  
  const avgScorePerHand = handsData.reduce((sum, h) => sum + Number(h.score), 0) / handsData.length;
  const overallAvgLockout = totalLockouts > 0 ? (totalLockoutScore / totalLockouts).toFixed(2) : 'N/A';
  
  let html = '<h3>Scores</h3>';
  html += '<p style="color: #666; font-size: 0.9em; margin-bottom: 10px;">💡 Click column headers to sort</p>';
  html += '<div style="overflow-x: auto;">';
  html += '<table class="scores-table" id="activeSessionTable">';
  html += '<tr>';
  html += '<th onclick="sortActiveSessionTable(0)" style="cursor: pointer; user-select: none;">Player ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(1)" style="cursor: pointer; user-select: none;">Total ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(2)" style="cursor: pointer; user-select: none;">Hands ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(3)" style="cursor: pointer; user-select: none;">Avg Hand ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(4)" style="cursor: pointer; user-select: none;">Lockouts ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(5)" style="cursor: pointer; user-select: none;">LO Rate ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(6)" style="cursor: pointer; user-select: none;">Avg LO Score ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(7)" style="cursor: pointer; user-select: none;">False LO ⇅</th>';
  html += '<th onclick="sortActiveSessionTable(8)" style="cursor: pointer; user-select: none;">False LO Rate ⇅</th>';
  html += '</tr>';

  for (let i = 0; i < scores.length; i++) {
    const p = scores[i];
    const handsPlayed = p.hands.length;
    const avgHand = handsPlayed > 0 ? ((p.total - p.startingScore) / handsPlayed).toFixed(2) : '0';
    const lockoutRate = handsPlayed > 0 ? ((p.lockouts / handsPlayed) * 100).toFixed(1) : '0';
    const avgLockoutScore = p.lockoutScores.length > 0 ? (p.lockoutScores.reduce((sum, s) => sum + s, 0) / p.lockoutScores.length).toFixed(2) : 'N/A';
    const falseLockoutRate = p.totalLockouts > 0 ? ((p.falseLockouts / p.totalLockouts) * 100).toFixed(1) : '0';
    
    html += '<tr>';
    html += '<td><strong>' + p.username + '</strong>' + (p.joinHand > 1 ? ' <span class="late-join-badge">H' + p.joinHand + '</span>' : '') + '</td>';
    html += '<td>' + p.total + '</td>';
    html += '<td>' + handsPlayed + '</td>';
    html += '<td>' + avgHand + '</td>';
    html += '<td>' + p.lockouts + '</td>';
    html += '<td>' + lockoutRate + '%</td>';
    html += '<td>' + avgLockoutScore + '</td>';
    html += '<td>' + p.falseLockouts + '</td>';
    html += '<td>' + falseLockoutRate + '%</td>';
    html += '</tr>';
  }
  html += '</table></div>';
  
  html += '<div style="background: linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%); padding: 20px; border-radius: 10px; margin-top: 20px; border-left: 4px solid #4caf50;">';
  html += '<h3 style="color: #2e7d32; margin-bottom: 15px;">📊 Session Statistics</h3>';
  html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">';
  html += '<div><strong>🎴 Total Hands:</strong> ' + (new Set(handsData.map(h => h.hand_number)).size) + '</div>';
  html += '<div><strong>📈 Avg Score/Hand:</strong> ' + avgScorePerHand.toFixed(2) + '</div>';
  html += '<div><strong>🏆 Current Leader:</strong> ' + leader.username + ' (' + leader.total + ' pts)</div>';
  html += '<div><strong>📏 Biggest Gap:</strong> ' + biggestGap + ' points</div>';
  html += '<div><strong>🎯 Most Lockouts:</strong> ' + mostLockoutsPlayer.username + ' (' + mostLockoutsPlayer.lockouts + ')</div>';
  html += '<div><strong>⚠️ False Lockouts:</strong> ' + falseLockoutCount + '</div>';
  html += '</div>';
  html += '<div style="background: white; padding: 15px; border-radius: 8px; margin-top: 10px;">';
  html += '<strong style="color: #667eea;">Lockout Performance:</strong><br>';
  html += '<div style="margin-top: 10px;">• <strong>Overall Avg:</strong> ' + overallAvgLockout + '</div>';
  
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
    let chartsHtml = '<h3 style="margin-top: 30px;">Session Graphs</h3>';
    chartsHtml += '<div class="chart-container"><canvas id="activeWormChart"></canvas></div>';
    chartsHtml += '<div class="chart-container"><canvas id="activeManhattanChart"></canvas></div>';
    chartSection.innerHTML = chartsHtml;
    
    const playerHandsData = {};
    const playerIdsArray = [];
    for (let i = 0; i < scores.length; i++) {
      const p = scores[i];
      const playerId = sessionPlayers.find(sp => sp.username === p.username).player_id;
      playerIdsArray.push(playerId);
      playerHandsData[playerId] = p.hands.map(h => h.score);
    }
    
    setTimeout(function() {
      drawActiveWormChart(playerHandsData, playerIdsArray);
      drawActiveManhattanChart(playerHandsData, playerIdsArray);
    }, 100);
  }
}
