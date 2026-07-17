// Statistics & Comparisons

async function loadStats() {
  const contentDiv = document.getElementById('statsContent');
  contentDiv.innerHTML = 
    '<div class="skeleton-card">' +
      '<h3 style="color: #667eea; margin-bottom: 30px;">Loading statistics...</h3>' +
      '<div class="stats-grid">' +
        '<div class="skeleton-stat-card">' +
          '<div class="shimmer-wrapper skeleton-text small" style="width: 70%; margin-bottom: 10px;"></div>' +
          '<div class="shimmer-wrapper skeleton-stat-value"></div>' +
        '</div>' +
      '</div>' +
    '</div>';
  
  await ensurePlayersLoaded();
  
  const sessionsWithHands = await apiCall('getSessionsWithHands', {});
  if (sessionsWithHands.error) {
    contentDiv.innerHTML = '<div class="error">Error loading stats</div>';
    return;
  }
  
  const completedSessionsData = [];
  const allSessionsData = [];
  
  for (let i = 0; i < sessionsWithHands.length; i++) {
    const item = sessionsWithHands[i];
    const isCompleted = (item.session.date_ended && item.session.date_ended !== '');
    const sessionData = {
      session_id: item.session.session_id,
      title: item.session.title,
      hands: item.hands,
      is_completed: isCompleted,
      player_join_info: item.session.player_join_info || '{}'
    };
    allSessionsData.push(sessionData);
    if (isCompleted) {
      completedSessionsData.push(sessionData);
    }
  }
  
  const stats = calculateOverallStats(completedSessionsData, allSessionsData, allPlayers);
  displayOverallStats(stats, completedSessionsData.length);
}

function calculateOverallStats(completedSessionsData, allSessionsData, playersData) {
  const playerStats = {};
  
  for (let i = 0; i < playersData.length; i++) {
    const player = playersData[i];
    playerStats[player.player_id] = {
      username: player.username,
      sessionsWon: 0,
      sessionsPlayed: 0,
      handsWon: 0,
      handsPlayed: 0,
      totalScore: 0,
      lockoutScores: [],
      falseLockouts: 0,
      totalLockouts: 0,
      currentHandStreak: 0,
      maxHandStreak: 0,
      bestMargin: 0,
      worstMargin: 0
    };
  }
  
  for (let s = 0; s < allSessionsData.length; s++) {
    const session = allSessionsData[s];
    const playerUniqueHands = {};
    
    for (let i = 0; i < playersData.length; i++) {
      playerUniqueHands[playersData[i].player_id] = new Set();
    }
    
    for (let h = 0; h < session.hands.length; h++) {
      const hand = session.hands[h];
      if (playerStats[hand.player_id]) {
        playerStats[hand.player_id].totalScore += Number(hand.score);
        playerUniqueHands[hand.player_id].add(Number(hand.hand_number));
        
        if (hand.lockout_player_id && String(hand.lockout_player_id) === String(hand.player_id)) {
          playerStats[hand.player_id].totalLockouts++;
          if (hand.false_lockout == 1 || hand.false_lockout === true) {
            playerStats[hand.player_id].falseLockouts++;
            playerStats[hand.player_id].currentHandStreak = 0;
          } else {
            playerStats[hand.player_id].handsWon++;
            const lockoutScoreToUse = hand.lockout_score ? Number(hand.lockout_score) : Number(hand.score);
            playerStats[hand.player_id].lockoutScores.push(lockoutScoreToUse);
            playerStats[hand.player_id].currentHandStreak++;
            if (playerStats[hand.player_id].currentHandStreak > playerStats[hand.player_id].maxHandStreak) {
              playerStats[hand.player_id].maxHandStreak = playerStats[hand.player_id].currentHandStreak;
            }
          }
        } else {
          playerStats[hand.player_id].currentHandStreak = 0;
        }
      }
    }
    
    for (let playerId in playerUniqueHands) {
      const uniqueHandCount = playerUniqueHands[playerId].size;
      if (uniqueHandCount > 0) {
        playerStats[playerId].handsPlayed += uniqueHandCount;
      }
    }
  }
  
  for (let s = 0; s < completedSessionsData.length; s++) {
    const session = completedSessionsData[s];
    const playerTotals = {};
    const playersInSession = new Set();
    
    try {
      const ji = JSON.parse(session.player_join_info || '{}');
      for (let pid in ji) {
        if (ji[pid] && ji[pid].starting_score !== undefined) {
          playerTotals[pid] = Number(ji[pid].starting_score);
        }
      }
    } catch(e) {}
    
    for (let h = 0; h < session.hands.length; h++) {
      const hand = session.hands[h];
      if (playerTotals[hand.player_id] === undefined) {
        playerTotals[hand.player_id] = 0;
      }
      playerTotals[hand.player_id] += Number(hand.score);
      playersInSession.add(hand.player_id);
    }
    
    playersInSession.forEach(playerId => {
      if (playerStats[playerId]) {
        playerStats[playerId].sessionsPlayed++;
      }
    });
    
    let lowestScore = Infinity;
    let winnerPlayerIds = [];
    for (let playerId in playerTotals) {
      const score = playerTotals[playerId];
      if (score < lowestScore) {
        lowestScore = score;
        winnerPlayerIds = [playerId];
      } else if (score === lowestScore) {
        winnerPlayerIds.push(playerId);
      }
    }
    
    let secondLowestScore = Infinity;
    for (let playerId in playerTotals) {
      const score = playerTotals[playerId];
      if (score > lowestScore && score < secondLowestScore) {
        secondLowestScore = score;
      }
    }
    
    for (let playerId in playerTotals) {
      if (playerStats[playerId]) {
        if (winnerPlayerIds.indexOf(String(playerId)) !== -1) {
          playerStats[playerId].sessionsWon += (1 / winnerPlayerIds.length);
          if (secondLowestScore !== Infinity) {
            const margin = secondLowestScore - lowestScore;
            if (margin > playerStats[playerId].bestMargin) {
              playerStats[playerId].bestMargin = margin;
            }
          }
        } else {
          const margin = playerTotals[playerId] - lowestScore;
          if (margin > playerStats[playerId].worstMargin) {
            playerStats[playerId].worstMargin = margin;
          }
        }
      }
    }
  }
  
  return playerStats;
}

function displayOverallStats(stats, totalSessions) {
  let mostSessionsWon = { player: 'N/A', wins: 0 };
  let mostHandsWon = { player: 'N/A', hands: 0 };
  let bestSessionWinRate = { player: 'N/A', rate: 0 };
  let bestHandWinRate = { player: 'N/A', rate: 0 };
  let lowestAvgScore = { player: 'N/A', avg: Infinity };
  let mostFalseLockouts = { player: 'N/A', count: 0 };
  let longestHandStreak = { player: 'N/A', streak: 0 };
  let bestAvgLockoutScore = { player: 'N/A', avg: Infinity };
  let totalHands = 0;
  
  for (let playerId in stats) {
    if (stats[playerId].handsPlayed > totalHands) {
      totalHands = stats[playerId].handsPlayed;
    }
  }
  
  for (let playerId in stats) {
    const ps = stats[playerId];
    
    if (ps.sessionsWon > mostSessionsWon.wins) {
      mostSessionsWon = { player: ps.username, wins: ps.sessionsWon.toFixed(1) };
    }
    if (ps.handsWon > mostHandsWon.hands) {
      mostHandsWon = { player: ps.username, hands: ps.handsWon };
    }
    if (ps.sessionsPlayed > 0) {
      const sessionWinRate = (ps.sessionsWon / ps.sessionsPlayed) * 100;
      if (sessionWinRate > bestSessionWinRate.rate) {
        bestSessionWinRate = { player: ps.username, rate: sessionWinRate.toFixed(1) };
      }
    }
    if (ps.handsPlayed > 0) {
      const handWinRate = (ps.handsWon / ps.handsPlayed) * 100;
      if (handWinRate > bestHandWinRate.rate) {
        bestHandWinRate = { player: ps.username, rate: handWinRate.toFixed(1) };
      }
    }
    if (ps.handsPlayed > 0) {
      const avgScore = ps.totalScore / ps.handsPlayed;
      if (avgScore < lowestAvgScore.avg) {
        lowestAvgScore = { player: ps.username, avg: avgScore.toFixed(2) };
      }
    }
    if (ps.falseLockouts > mostFalseLockouts.count) {
      mostFalseLockouts = { player: ps.username, count: ps.falseLockouts };
    }
    if (ps.maxHandStreak > longestHandStreak.streak) {
      longestHandStreak = { player: ps.username, streak: ps.maxHandStreak };
    }
    if (ps.lockoutScores.length > 0) {
      const avgLockoutScore = ps.lockoutScores.reduce((sum, score) => sum + score, 0) / ps.lockoutScores.length;
      if (avgLockoutScore < bestAvgLockoutScore.avg) {
        bestAvgLockoutScore = { player: ps.username, avg: avgLockoutScore.toFixed(2) };
      }
    }
  }
  
  let html = '<div class="stats-grid">';
  html += '<div class="stat-card"><h4>Total Sessions</h4><p class="stat-value">' + totalSessions + '</p></div>';
  html += '<div class="stat-card"><h4>Total Hands</h4><p class="stat-value">' + totalHands + '</p></div>';
  html += '<div class="stat-card"><h4>Most Sessions Won</h4><p class="stat-value">' + mostSessionsWon.player + '</p><p>' + mostSessionsWon.wins + ' wins</p></div>';
  html += '<div class="stat-card"><h4>Most Hands Won</h4><p class="stat-value">' + mostHandsWon.player + '</p><p>' + mostHandsWon.hands + ' hands</p></div>';
  html += '<div class="stat-card"><h4>Best Session Win Rate</h4><p class="stat-value">' + bestSessionWinRate.player + '</p><p>' + bestSessionWinRate.rate + '%</p></div>';
  html += '<div class="stat-card"><h4>Best Hand Win Rate</h4><p class="stat-value">' + bestHandWinRate.player + '</p><p>' + bestHandWinRate.rate + '%</p></div>';
  html += '<div class="stat-card"><h4>Lowest Avg Score/Hand</h4><p class="stat-value">' + lowestAvgScore.player + '</p><p>' + lowestAvgScore.avg + '</p></div>';
  html += '<div class="stat-card"><h4>Best Avg Lockout Score</h4><p class="stat-value">' + bestAvgLockoutScore.player + '</p><p>' + bestAvgLockoutScore.avg + '</p></div>';
  html += '<div class="stat-card"><h4>Longest Hand Streak</h4><p class="stat-value">' + longestHandStreak.player + '</p><p>' + longestHandStreak.streak + ' hands</p></div>';
  html += '<div class="stat-card"><h4>Most False Lockouts</h4><p class="stat-value">' + mostFalseLockouts.player + '</p><p>' + mostFalseLockouts.count + ' times</p></div>';
  html += '</div>';
  
  html += '<div style="background: #fff3cd; padding: 10px; border-radius: 8px; margin: 15px 0; border-left: 4px solid #ffc107; font-size: 0.9em;">';
  html += '<strong>ℹ️ Note:</strong> Hand-level stats include active sessions. Session-level stats only include completed sessions.';
  html += '</div>';
  
  html += '<h3 style="margin-top: 30px;">Player Breakdown</h3>';
  html += '<p style="color: #666; font-size: 0.9em; margin-bottom: 10px;">💡 Click column headers to sort</p>';
  html += '<div style="overflow-x: auto;"><table class="scores-table" id="playerBreakdownTable">';
  html += '<tr>';
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
  html += '</tr>';

  for (let playerId in stats) {
    const ps = stats[playerId];
    const sessionWinRate = ps.sessionsPlayed > 0 ? ((ps.sessionsWon / ps.sessionsPlayed) * 100).toFixed(1) : '0';
    const lockoutRate = ps.handsPlayed > 0 ? ((ps.handsWon / ps.handsPlayed) * 100).toFixed(1) : '0';
    const avgScore = ps.handsPlayed > 0 ? (ps.totalScore / ps.handsPlayed).toFixed(2) : '0';
    const falseLockoutRate = ps.totalLockouts > 0 ? ((ps.falseLockouts / ps.totalLockouts) * 100).toFixed(1) : '0';
    const avgLockoutScore = ps.lockoutScores.length > 0 ? (ps.lockoutScores.reduce((sum, score) => sum + score, 0) / ps.lockoutScores.length).toFixed(2) : 'N/A';
    
    html += '<tr><td>' + ps.username + '</td><td>' + ps.sessionsPlayed + '</td><td>' + ps.sessionsWon.toFixed(1) + '</td><td>' + sessionWinRate + '%</td><td>' + ps.handsPlayed + '</td><td>' + avgScore + '</td><td>' + ps.handsWon + '</td><td>' + lockoutRate + '%</td><td>' + avgLockoutScore + '</td><td>' + ps.falseLockouts + '</td><td>' + falseLockoutRate + '%</td></tr>';
  }
  html += '</table></div>';
  
  document.getElementById('statsContent').innerHTML = html;
}

async function showOverallStats() {
  const contentDiv = document.getElementById('statsContent');
  contentDiv.innerHTML = '<div class="loading">Loading overall stats...</div>';
  await loadStats();
}

async function showHeadToHeadList() {
  const contentDiv = document.getElementById('statsContent');
  contentDiv.innerHTML = 
    '<div class="skeleton-card">' +
      '<h3 style="color: #667eea; margin-bottom: 20px;">Loading head-to-head records...</h3>' +
    '</div>';
  
  await ensurePlayersLoaded();
  
  const data = await apiCall('getHeadToHeadMatrix', {});
  
  if (data.error) {
    contentDiv.innerHTML = '<div class="error">Error loading data: ' + data.error + '</div>';
    return;
  }
  
  if (data.length === 0) {
    contentDiv.innerHTML = '<div class="placeholder-content"><h3>Not Enough Data</h3><p>Play more sessions to see head-to-head records!</p></div>';
    return;
  }
  
  data.sort(function(a, b) {
    return b.sessions_together - a.sessions_together;
  });
  
  let html = '<h2>⚔️ Head-to-Head Records</h2>';
  html += '<p style="color: #666; margin-bottom: 20px;">Direct records when playing in the same session (who finished with a lower score)</p>';
  
  html += '<div style="display: grid; gap: 15px; margin-bottom: 20px;">';
  
  for (let i = 0; i < data.length; i++) {
    const m = data[i];
    const p1Name = getPlayerName(m.p1);
    const p2Name = getPlayerName(m.p2);
    const total = m.p1_wins + m.p2_wins + m.ties;
    
    if (total === 0) continue;
    
    const p1Pct = total > 0 ? Math.round((m.p1_wins / total) * 100) : 50;
    const p2Pct = total > 0 ? Math.round((m.p2_wins / total) * 100) : 50;

    html += '<div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">';
    
    html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
    html += '<strong style="color: #667eea;">' + p1Name + '</strong>';
    html += '<span style="color: #333; font-weight: 600; font-size: 1.1em;">';
    html += m.p1_wins + '-' + m.p2_wins;
    if (m.ties > 0) html += '-' + m.ties;
    html += '</span>';
    html += '<strong style="color: #f5576c;">' + p2Name + '</strong>';
    html += '</div>';
    
    html += '<div style="display: flex; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">';
    html += '<div style="width: ' + p1Pct + '%; background: #667eea;"></div>';
    html += '<div style="width: ' + p2Pct + '%; background: #f5576c;"></div>';
    html += '</div>';
    
    html += '<div style="display: flex; justify-content: space-between; font-size: 0.85em; color: #666; margin-bottom: 10px;">';
    html += '<span>' + p1Pct + '%</span>';
    html += '<span>' + m.sessions_together + ' session' + (m.sessions_together > 1 ? 's' : '') + ' together</span>';
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

async function showPlayerComparisonUI() {
  await ensurePlayersLoaded();
  
  const contentDiv = document.getElementById('statsContent');
  
  let html = '<h3 style="margin-bottom: 20px;">⚔️ Compare Two Players</h3>';
  
  html += '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">';
  
  html += '<div>';
  html += '<label style="display: block; margin-bottom: 8px; font-weight: 600; color: #667eea;">Player 1</label>';
  html += '<select id="comparisonPlayer1" style="width: 100%; padding: 12px; border: 2px solid #667eea; border-radius: 8px; font-size: 1em;">';
  html += '<option value="">Select player...</option>';
  for (let i = 0; i < allPlayers.length; i++) {
    html += '<option value="' + allPlayers[i].player_id + '">' + allPlayers[i].username + '</option>';
  }
  html += '</select>';
  html += '</div>';
  
  html += '<div>';
  html += '<label style="display: block; margin-bottom: 8px; font-weight: 600; color: #f5576c;">Player 2</label>';
  html += '<select id="comparisonPlayer2" style="width: 100%; padding: 12px; border: 2px solid #f5576c; border-radius: 8px; font-size: 1em;">';
  html += '<option value="">Select player...</option>';
  for (let i = 0; i < allPlayers.length; i++) {
    html += '<option value="' + allPlayers[i].player_id + '">' + allPlayers[i].username + '</option>';
  }
  html += '</select>';
  html += '</div>';
  
  html += '</div>';
  
  html += '<button class="btn btn-success" id="comparePlayersBtn" style="width: 100%;">Compare Players</button>';
  
  contentDiv.innerHTML = html;
  
  setTimeout(function() {
    const btn = document.getElementById('comparePlayersBtn');
    if (btn) {
      btn.addEventListener('click', showPlayerComparison);
    }
  }, 50);
}

async function showPlayerComparison() {
  await ensurePlayersLoaded();
  
  const contentDiv = document.getElementById('statsContent');
  
  const p1Select = document.getElementById('comparisonPlayer1');
  const p2Select = document.getElementById('comparisonPlayer2');
  
  if (!p1Select || !p2Select) {
    contentDiv.innerHTML = '<div class="error">Error: Please select players from the dropdowns above.</div>';
    return;
  }
  
  const p1Id = p1Select.value;
  const p2Id = p2Select.value;
  
  if (!p1Id || !p2Id) {
    contentDiv.innerHTML = '<div class="error">Please select two players</div>';
    return;
  }
  
  if (p1Id === p2Id) {
    contentDiv.innerHTML = '<div class="error">Please select two different players</div>';
    return;
  }
  
  contentDiv.innerHTML = 
    '<div class="skeleton-card">' +
      '<h3 style="color: #667eea; margin-bottom: 30px; text-align: center;">Loading player comparison...</h3>' +
    '</div>';
  
  showScreen('statsScreen');
  
  const data = await apiCall('getPlayerComparisonDetailed', {
    player1_id: p1Id,
    player2_id: p2Id
  });

  if (data.error) {
    contentDiv.innerHTML = '<div class="error">Error: ' + data.error + '</div>';
    return;
  }
  
  const p1Name = getPlayerName(p1Id);
  const p2Name = getPlayerName(p2Id);
  
  let html = '';
  
  html += '<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 8px; margin-bottom: 30px; text-align: center;">';
  html += '<h2 style="color: white; margin: 0; font-size: 1.8em;">' + p1Name + ' vs ' + p2Name + '</h2>';
  html += '</div>';
  
  html += '<button class="btn btn-info" onclick="showPlayerComparisonUI()" style="margin-bottom: 30px; width: 100%;">← Change Players</button>';
  
  const ts = data.sessions_together_stats;
  
  html += '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #667eea;">';
  
  html += '<h3 style="color: #667eea; margin-bottom: 20px;">📊 Sessions Together</h3>';
  html += '<p style="color: #666; font-size: 0.9em; margin-bottom: 20px;"><strong>Head-to-head record:</strong> Who finished with a lower score when both players competed in the same session (regardless of who won overall)</p>';
  
  if (ts.total_sessions === 0) {
    html += '<div style="background: white; padding: 15px; border-radius: 6px; color: #666; text-align: center;">';
    html += 'These players have never played together';
    html += '</div>';
  } else {
    html += '<div style="overflow-x: auto;"><table class="scores-table">';
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
    
    html += '</table></div>';
    
    if (ts.best_with && ts.worst_with && ts.best_with.player_id !== ts.worst_with.player_id) {
      html += '<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #ffc107;">';
      html += '<h4 style="color: #856404; margin-bottom: 10px; font-size: 0.95em;">📊 Performance Context</h4>';
      html += '<p style="font-size: 0.85em; color: #666; margin-bottom: 10px;">When ' + p1Name + ' plays against ' + p2Name + ' <strong>head-to-head</strong>, ' + p1Name + '\'s win rate varies depending on who else is playing:</p>';
      
      html += '<div style="background: white; padding: 10px; border-radius: 6px; margin-bottom: 8px;">';
      html += '<div style="font-size: 0.85em; color: #4caf50; font-weight: 600; margin-bottom: 3px;">✅ Best with ' + getPlayerName(ts.best_with.player_id) + '</div>';
      html += '<div style="color: #333; font-size: 0.85em;">' + p1Name + ' beats ' + p2Name + ' in ' + ts.best_with.wins + ' out of ' + ts.best_with.total + ' sessions when ' + getPlayerName(ts.best_with.player_id) + ' is also playing</div>';
      html += '</div>';
      
      html += '<div style="background: white; padding: 10px; border-radius: 6px;">';
      html += '<div style="font-size: 0.85em; color: #f44336; font-weight: 600; margin-bottom: 3px;">❌ Worst with ' + getPlayerName(ts.worst_with.player_id) + '</div>';
      html += '<div style="color: #333; font-size: 0.85em;">' + p1Name + ' beats ' + p2Name + ' in ' + ts.worst_with.wins + ' out of ' + ts.worst_with.total + ' sessions when ' + getPlayerName(ts.worst_with.player_id) + ' is also playing</div>';
      html += '</div>';
      
      html += '</div>';
    }
  }
  
  html += '</div>';
  
  const as1 = data.all_sessions_stats.player1;
  const as2 = data.all_sessions_stats.player2;
  
  html += '<div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 30px; border-left: 4px solid #f5576c;">';
  
  html += '<h3 style="color: #f5576c; margin-bottom: 20px;">📊 All Sessions</h3>';
  html += '<p style="color: #666; font-size: 0.9em; margin-bottom: 20px;"><strong>Overall wins:</strong> Sessions where each player had the lowest score and won outright (across all sessions they participated in)</p>';
  
  html += '<div style="overflow-x: auto;"><table class="scores-table">';
  html += '<tr><th>Stat</th><th style="color: white; background: #667eea;">' + p1Name + '</th><th style="color: white; background: #f5576c;">' + p2Name + '</th></tr>';
  
  html += '<tr><td><strong>Wins</strong></td><td>' + as1.wins + '</td><td>' + as2.wins + '</td></tr>';
  html += '<tr><td><strong>Losses</strong></td><td>' + as1.losses + '</td><td>' + as2.losses + '</td></tr>';
  if (as1.ties > 0 || as2.ties > 0) {
    html += '<tr><td><strong>Ties</strong></td><td>' + as1.ties + '</td><td>' + as2.ties + '</td></tr>';
  }
  html += '<tr><td><strong>Win Rate</strong></td><td>' + as1.win_rate + '%</td><td>' + as2.win_rate + '%</td></tr>';
  html += '<tr><td><strong>Total Score</strong></td><td>' + as1.total_score + '</td><td>' + as2.total_score + '</td></tr>';
  html += '<tr><td><strong>Hands Played</strong></td><td>' + as1.total_hands + '</td><td>' + as2.total_hands + '</td></tr>';
  html += '<tr><td><strong>Avg Hand</strong></td><td>' + as1.avg_hand + '</td><td>' + as2.avg_hand + '</td></tr>';
  html += '<tr><td><strong>Lockouts</strong></td><td>' + as1.lockouts + '</td><td>' + as2.lockouts + '</td></tr>';
  html += '<tr><td><strong>Lockout Rate</strong></td><td>' + as1.lockout_rate + '%</td><td>' + as2.lockout_rate + '%</td></tr>';
  html += '<tr><td><strong>Avg Lockout Score</strong></td><td>' + (as1.lockouts > 0 ? as1.avg_lockout : 'N/A') + '</td><td>' + (as2.lockouts > 0 ? as2.avg_lockout : 'N/A') + '</td></tr>';
  html += '<tr><td><strong>False Lockouts</strong></td><td>' + as1.false_lockouts + '</td><td>' + as2.false_lockouts + '</td></tr>';
  html += '<tr><td><strong>False Lockout Rate</strong></td><td>' + (as1.false_lockouts + as1.lockouts > 0 ? as1.false_lockout_rate + '%' : 'N/A') + '</td><td>' + (as2.false_lockouts + as2.lockouts > 0 ? as2.false_lockout_rate + '%' : 'N/A') + '</td></tr>';
  
  html += '</table></div>';
  
  html += '</div>';
  
  if (data.sessions_together.length > 0) {
    html += '<div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 30px; border-left: 4px solid #9c27b0;">';
    
    html += '<h3 style="color: #9c27b0; margin-bottom: 20px;">📅 Session History</h3>';
    html += '<p style="color: #666; font-size: 0.9em; margin-bottom: 20px;">Sessions where both players competed (click to view details)</p>';
    
    for (let i = data.sessions_together.length - 1; i >= 0; i--) {
      const s = data.sessions_together[i];
      const winner = s.p1_won && !s.p2_won ? p1Name : s.p2_won && !s.p1_won ? p2Name : 'Tie';
      const winnerColor = s.p1_won && !s.p2_won ? '#667eea' : s.p2_won && !s.p1_won ? '#f5576c' : '#ff9800';
      
      var dateObj = new Date(s.date);
      var month = String(dateObj.getMonth() + 1).padStart(2, '0');
      var day = String(dateObj.getDate()).padStart(2, '0');
      var year = dateObj.getFullYear();
      var cleanDate = month + '/' + day + '/' + year;
      
      html += '<div style="padding: 15px; background: white; border-radius: 8px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s; border: 1px solid #e0e0e0;" onclick="viewSessionDetailFromComparison(' + s.session_id + ', this)" onmouseover="this.style.background=\'#f8f9fa\'; this.style.borderColor=\'#9c27b0\';" onmouseout="this.style.background=\'white\'; this.style.borderColor=\'#e0e0e0\';">';
      
      html += '<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">';
      html += '<div style="font-weight: 600; color: #333; font-size: 1.05em;">' + s.title + ' 🔗</div>';
      html += '<div style="color: ' + winnerColor + '; font-weight: 600; font-size: 1em; padding: 4px 12px; background: ' + winnerColor + '20; border-radius: 12px;">' + winner + '</div>';
      html += '</div>';
      
      html += '<div style="font-size: 0.85em; color: #666; margin-bottom: 8px;">' + cleanDate + ' • ' + s.player_count + ' players</div>';
      
      html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: #f8f9fa; border-radius: 6px;">';
      html += '<div style="font-size: 0.9em;"><strong style="color: #667eea;">' + p1Name + ':</strong> ' + s.p1_score + ' pts</div>';
      html += '<div style="font-size: 0.9em;"><strong style="color: #f5576c;">' + p2Name + ':</strong> ' + s.p2_score + ' pts</div>';
      html += '</div>';
      
      html += '</div>';
    }
    
    html += '</div>';
  }
  
  contentDiv.innerHTML = html;
}

async function viewSessionDetailFromComparison(sessionId, buttonElement) {
  if (buttonElement) {
    setButtonLoading(buttonElement, true);
  }
  
  if (allSessions.length === 0) {
    await loadPreviousSessions();
  }
  
  const sessionIndex = allSessions.findIndex(s => String(s.session_id) === String(sessionId));
  
  if (sessionIndex !== -1) {
    viewSessionDetail(sessionIndex, buttonElement);
  } else {
    alert('Session not found');
    if (buttonElement) {
      setButtonLoading(buttonElement, false);
    }
  }
}

// ============================================
// TABLE SORTING
// ============================================

let currentSortColumn = -1;
let currentSortAscending = true;

function sortStatsTable(columnIndex) {
  const table = document.getElementById('playerBreakdownTable');
  if (!table) return;
  
  const rows = Array.from(table.querySelectorAll('tr')).slice(1);
  
  if (currentSortColumn === columnIndex) {
    currentSortAscending = !currentSortAscending;
  } else {
    currentSortAscending = true;
    currentSortColumn = columnIndex;
  }
  
  rows.sort(function(a, b) {
    const aCell = a.cells[columnIndex].textContent.trim();
    const bCell = b.cells[columnIndex].textContent.trim();
    
    const aNum = parseFloat(aCell.replace('%', ''));
    const bNum = parseFloat(bCell.replace('%', ''));
    
    let comparison = 0;
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      comparison = aNum - bNum;
    } else {
      comparison = aCell.localeCompare(bCell);
    }
    
    return currentSortAscending ? comparison : -comparison;
  });
  
  for (let i = 0; i < rows.length; i++) {
    table.appendChild(rows[i]);
  }
  
  const headers = table.querySelectorAll('th');
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const text = header.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ⇅', '');
    if (i === columnIndex) {
      header.textContent = text + (currentSortAscending ? ' ↑' : ' ↓');
      header.style.color = 'white';
      header.style.backgroundColor = '#5568d3';
      header.style.fontWeight = 'bold';
    } else {
      header.textContent = text + ' ⇅';
      header.style.color = 'white';
      header.style.backgroundColor = '#667eea';
      header.style.fontWeight = '600';
    }
  }
}

let currentSessionSortColumn = -1;
let currentSessionSortAscending = true;

function sortSessionTable(columnIndex) {
  const table = document.getElementById('sessionDetailTable');
  if (!table) return;
  
  const rows = Array.from(table.querySelectorAll('tr')).slice(1);
  
  if (currentSessionSortColumn === columnIndex) {
    currentSessionSortAscending = !currentSessionSortAscending;
  } else {
    currentSessionSortAscending = true;
    currentSessionSortColumn = columnIndex;
  }
  
  rows.sort(function(a, b) {
    const aCell = a.cells[columnIndex].textContent.trim();
    const bCell = b.cells[columnIndex].textContent.trim();
    
    const aNum = parseFloat(aCell.replace('%', ''));
    const bNum = parseFloat(bCell.replace('%', ''));
    
    let comparison = 0;
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      comparison = aNum - bNum;
    } else {
      comparison = aCell.localeCompare(bCell);
    }
    
    return currentSessionSortAscending ? comparison : -comparison;
  });
  
  for (let i = 0; i < rows.length; i++) {
    table.appendChild(rows[i]);
  }
  
  const headers = table.querySelectorAll('th');
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const text = header.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ⇅', '');
    if (i === columnIndex) {
      header.textContent = text + (currentSessionSortAscending ? ' ↑' : ' ↓');
      header.style.color = 'white';
      header.style.backgroundColor = '#5568d3';
      header.style.fontWeight = 'bold';
    } else {
      header.textContent = text + ' ⇅';
      header.style.color = 'white';
      header.style.backgroundColor = '#667eea';
      header.style.fontWeight = '600';
    }
  }
}

let currentActiveSortColumn = -1;
let currentActiveSortAscending = true;

function sortActiveSessionTable(columnIndex) {
  const table = document.getElementById('activeSessionTable');
  if (!table) return;
  
  const rows = Array.from(table.querySelectorAll('tr')).slice(1);
  
  if (currentActiveSortColumn === columnIndex) {
    currentActiveSortAscending = !currentActiveSortAscending;
  } else {
    currentActiveSortAscending = true;
    currentActiveSortColumn = columnIndex;
  }
  
  rows.sort(function(a, b) {
    const aCell = a.cells[columnIndex].textContent.trim();
    const bCell = b.cells[columnIndex].textContent.trim();
    
    const aNum = parseFloat(aCell.replace('%', ''));
    const bNum = parseFloat(bCell.replace('%', ''));
    
    let comparison = 0;
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      comparison = aNum - bNum;
    } else {
      comparison = aCell.localeCompare(bCell);
    }
    
    return currentActiveSortAscending ? comparison : -comparison;
  });
  
  for (let i = 0; i < rows.length; i++) {
    table.appendChild(rows[i]);
  }
  
  const headers = table.querySelectorAll('th');
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const text = header.textContent.replace(' ↑', '').replace(' ↓', '').replace(' ⇅', '');
    if (i === columnIndex) {
      header.textContent = text + (currentActiveSortAscending ? ' ↑' : ' ↓');
      header.style.color = 'white';
      header.style.backgroundColor = '#5568d3';
      header.style.fontWeight = 'bold';
    } else {
      header.textContent = text + ' ⇅';
      header.style.color = 'white';
      header.style.backgroundColor = '#667eea';
      header.style.fontWeight = '600';
    }
  }
}
