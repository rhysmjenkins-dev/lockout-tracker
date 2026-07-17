// Active Session Charts

function drawActiveWormChart(playerHands, playerIds) {
  const ctx = document.getElementById('activeWormChart');
  if (!ctx) return;
  
  const datasets = [];
  const colors = ['#667eea', '#f5576c', '#4facfe', '#00f2fe', '#fa709a'];
  const maxHands = Math.max.apply(null, Object.keys(playerHands).map(k => playerHands[k].length));
  
  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    const hands = playerHands[playerId];
    const joinHand = getPlayerJoinHand(playerId);
    const startingScore = getPlayerStartingScore(playerId);
    let cumulative = startingScore;
    const cumulativeScores = [];
    
    // Add nulls for hands before joining
    for (let h = 1; h < joinHand; h++) {
      cumulativeScores.push(null);
    }
    
    // Add cumulative scores for hands played
    for (let j = 0; j < hands.length; j++) {
      cumulative += hands[j];
      cumulativeScores.push(cumulative);
    }
    
    datasets.push({
      label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''),
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
  
  new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Cricket Worm' },
        legend: { display: true, position: 'top' }
      },
      scales: {
        y: { title: { display: true, text: 'Cumulative Score' } }
      }
    }
  });
}

function drawActiveManhattanChart(playerHands, playerIds) {
  const ctx = document.getElementById('activeManhattanChart');
  if (!ctx) return;
  
  const colors = ['#667eea', '#f5576c', '#4facfe', '#00f2fe', '#fa709a'];
  const maxHands = Math.max.apply(null, Object.keys(playerHands).map(k => playerHands[k].length));
  const labels = [];
  for (let i = 1; i <= maxHands; i++) labels.push('Hand ' + i);
  
  const datasets = [];
  for (let i = 0; i < playerIds.length; i++) {
    const playerId = playerIds[i];
    const hands = playerHands[playerId];
    const joinHand = getPlayerJoinHand(playerId);
    const dataArray = [];
    
    // Add nulls for hands before joining
    for (let h = 1; h < joinHand; h++) {
      dataArray.push(null);
    }
    
    // Add actual scores for hands played
    for (let j = 0; j < hands.length; j++) {
      dataArray.push(hands[j]);
    }
    
    datasets.push({
      label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''),
      data: dataArray,
      backgroundColor: colors[i % colors.length],
      borderColor: colors[i % colors.length],
      borderWidth: 1
    });
  }
  
  new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Manhattan' },
        legend: { display: true, position: 'top' }
      },
      scales: {
        x: { title: { display: true, text: 'Hand Number' } },
        y: { title: { display: true, text: 'Score' }, beginAtZero: true }
      }
    }
  });
}

// ============================================
// COMPLETED SESSION CHARTS (WITH LATE JOINER SUPPORT)
// ============================================

function drawSessionWormChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session) {
  const ctx = document.getElementById('wormChart');
  if (!ctx) return;
  
  const datasets = [];
  const colors = ['#667eea', '#f5576c', '#4facfe', '#00f2fe', '#fa709a'];
  
  let maxHand = 0;
  for (let playerId in playerHandScores) {
    for (let i = 0; i < playerHandScores[playerId].length; i++) {
      if (playerHandScores[playerId][i].handNum > maxHand) {
        maxHand = playerHandScores[playerId][i].handNum;
      }
    }
  }
  
  for (let i = 0; i < sortedPlayers.length; i++) {
    const playerId = sortedPlayers[i];
    const hands = playerHandScores[playerId];
    const joinHand = playerJoinHands[playerId] || 1;
    
    let startingScore = 0;
    if (joinHand > 1 && session && session.player_join_info) {
      try {
        const fullInfo = JSON.parse(session.player_join_info);
        const info = fullInfo[playerId];
        if (info && typeof info === 'object' && info.starting_score !== undefined) {
          startingScore = info.starting_score;
        }
      } catch(e) {}
    }
    
    let cumulative = startingScore;
    const dataPoints = [];
    
    for (let h = 1; h < joinHand; h++) {
      dataPoints.push(null);
    }
    
    for (let j = 0; j < hands.length; j++) {
      cumulative += hands[j].score;
      dataPoints.push(cumulative);
    }
    
    datasets.push({
      label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''),
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
  
  new Chart(ctx.getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Cricket Worm' },
        legend: { display: true, position: 'top' }
      },
      scales: {
        y: { title: { display: true, text: 'Cumulative Score' } }
      }
    }
  });
}

function drawSessionManhattanChartWithJoinInfo(playerHandScores, sortedPlayers, playerJoinHands, session) {
  const ctx = document.getElementById('manhattanChart');
  if (!ctx) return;
  
  const colors = ['#667eea', '#f5576c', '#4facfe', '#00f2fe', '#fa709a'];
  
  let maxHand = 0;
  for (let playerId in playerHandScores) {
    for (let i = 0; i < playerHandScores[playerId].length; i++) {
      if (playerHandScores[playerId][i].handNum > maxHand) {
        maxHand = playerHandScores[playerId][i].handNum;
      }
    }
  }
  
  const labels = [];
  for (let i = 1; i <= maxHand; i++) labels.push('Hand ' + i);
  
  const datasets = [];
  for (let i = 0; i < sortedPlayers.length; i++) {
    const playerId = sortedPlayers[i];
    const hands = playerHandScores[playerId];
    const joinHand = playerJoinHands[playerId] || 1;
    
    const dataArray = [];
    for (let h = 1; h < joinHand; h++) {
      dataArray.push(null);
    }
    
    for (let j = 0; j < hands.length; j++) {
      dataArray.push(hands[j].score);
    }
    
    datasets.push({
      label: getPlayerName(playerId) + (joinHand > 1 ? ' (H' + joinHand + ')' : ''),
      data: dataArray,
      backgroundColor: colors[i % colors.length],
      borderColor: colors[i % colors.length],
      borderWidth: 1
    });
  }
  
  new Chart(ctx.getContext('2d'), {
    type: 'bar',
    data: { labels: labels, datasets: datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        title: { display: true, text: 'Manhattan' },
        legend: { display: true, position: 'top' }
      },
      scales: {
        x: { title: { display: true, text: 'Hand Number' } },
        y: { title: { display: true, text: 'Score' }, beginAtZero: true }
      }
    }
  });
}
