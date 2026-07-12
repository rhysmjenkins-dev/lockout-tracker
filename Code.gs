// ============================================
// LOCKOUT TRACKER 
// ============================================

function doGet(e) {
  var action = e.parameter.action;
  
  try {
    if (action === 'getPlayers') {
      return respond(getPlayers());
    } else if (action === 'addPlayer') {
      return respond(addPlayer(e.parameter.username, e.parameter.editor_name));
    } else if (action === 'getSessions') {
      return respond(getSessions());
    } else if (action === 'getRecentSessions') {
      return respond(getRecentSessions(e.parameter.limit));
    } else if (action === 'getSession') {
      return respond(getSession(e.parameter.session_id));
    } else if (action === 'createSession') {
      return respond(createSession(
        e.parameter.title, 
        e.parameter.host_player_id, 
        e.parameter.players_involved,
        e.parameter.notes,
        e.parameter.tags,
        e.parameter.false_lockout_penalty
      ));
    } else if (action === 'updateSession') {
      return respond(updateSession(
        e.parameter.session_id,
        e.parameter.notes,
        e.parameter.tags,
        e.parameter.editor_name
      ));
    } else if (action === 'addPlayerToSession') {
      return respond(addPlayerToSession(
        e.parameter.session_id,
        e.parameter.player_id,
        e.parameter.join_hand_number,
        e.parameter.editor_name
      ));
    } else if (action === 'closeSession') {
      return respond(closeSession(e.parameter.session_id, e.parameter.editor_name));
    } else if (action === 'getHands') {
      return respond(getHands(e.parameter.session_id));
    } else if (action === 'addHand') {
      return respond(addHand(
        e.parameter.session_id, 
        e.parameter.hand_number, 
        e.parameter.scores, 
        e.parameter.lockout_player_id, 
        e.parameter.false_lockout, 
        e.parameter.editor_name,
        e.parameter.comment,
        e.parameter.lockout_score
      ));
    } else if (action === 'updateHand') {
      return respond(updateHand(
        e.parameter.session_id, 
        e.parameter.hand_number, 
        e.parameter.scores, 
        e.parameter.lockout_player_id, 
        e.parameter.false_lockout, 
        e.parameter.editor_name,
        e.parameter.comment,
        e.parameter.lockout_score
      ));
    } else if (action === 'deleteHand') {
      return respond(deleteHand(e.parameter.session_id, e.parameter.hand_number, e.parameter.editor_name));
    } else if (action === 'getEditHistory') {
      return respond(getEditHistory(e.parameter.record_type, e.parameter.record_id));
    } else if (action === 'getSessionsWithHands') {
      return respond(getSessionsWithHands());
    } else if (action === 'getHeadToHeadMatrix') {
      return respond(getHeadToHeadMatrix());
    } else if (action === 'getPlayerComparisonDetailed') {
      return respond(getPlayerComparisonDetailed(e.parameter.player1_id, e.parameter.player2_id));
    } else {
      return respond({error: 'Unknown action: ' + action});
    }
  } catch(err) {
    return respond({error: err.toString(), stack: err.stack});
  }
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getNextId(sheetName) {
  var sheet = getSheet(sheetName);
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 1;
  var lastId = sheet.getRange(lastRow, 1).getValue();
  return Number(lastId) + 1;
}

function sheetToObjects(sheetName) {
  var sheet = getSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  
  var headers = data[0];
  var result = [];
  
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var value = data[i][j];
      obj[headers[j]] = (value === '' || value === null || value === undefined) ? '' : value;
    }
    result.push(obj);
  }
  
  return result;
}

function logEdit(editorName, action, recordType, recordId) {
  var sheet = getSheet('edit_history');
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var nextRow = sheet.getLastRow() + 1;
  var id = nextRow - 1;
  sheet.appendRow([id, timestamp, editorName, action, recordType, recordId]);
}

// ============================================
// PLAYERS
// ============================================

function getPlayers() {
  return sheetToObjects('players');
}

function addPlayer(username, editorName) {
  var sheet = getSheet('players');
  var id = getNextId('players');
  var date = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
  sheet.appendRow([id, username, date]);
  logEdit(editorName || 'SYSTEM', 'CREATED', 'player', id);
  return {success: true, player_id: id};
}

// ============================================
// SESSIONS
// ============================================

function getSessions() {
  return sheetToObjects('sessions');
}

function getRecentSessions(limit) {
  var sessions = sheetToObjects('sessions');
  sessions.sort(function(a, b) {
    var dateA = new Date(a.date_started);
    var dateB = new Date(b.date_started);
    return dateB - dateA;
  });
  var maxLimit = limit ? Math.min(Number(limit), sessions.length) : 20;
  return sessions.slice(0, maxLimit);
}

function getSession(sessionId) {
  var sessions = sheetToObjects('sessions');
  for (var i = 0; i < sessions.length; i++) {
    if (String(sessions[i].session_id) === String(sessionId)) {
      return sessions[i];
    }
  }
  return {error: 'Session not found'};
}

function createSession(title, hostPlayerId, playersInvolved, notes, tags, falseLockoutPenalty) {
  var sheet = getSheet('sessions');
  var id = getNextId('sessions');
  var dateStarted = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
  var sessionNotes = notes || '';
  var sessionTags = tags || '';
  var playerJoinInfo = '{}';
  var penalty = falseLockoutPenalty || 10;
  
  sheet.appendRow([id, title, hostPlayerId, playersInvolved, dateStarted, '', sessionNotes, sessionTags, playerJoinInfo, penalty]);
  logEdit(hostPlayerId, 'CREATED', 'session', id);
  return {success: true, session_id: id};
}

function updateSession(sessionId, notes, tags, editorName) {
  var sheet = getSheet('sessions');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      if (notes !== undefined && notes !== null) {
        sheet.getRange(i + 1, 7).setValue(notes);
      }
      if (tags !== undefined && tags !== null) {
        sheet.getRange(i + 1, 8).setValue(tags);
      }
      logEdit(editorName, 'UPDATED', 'session', sessionId);
      return {success: true};
    }
  }
  return {error: 'Session not found'};
}

function addPlayerToSession(sessionId, playerId, joinHandNumber, editorName) {
  var sheet = getSheet('sessions');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      var currentPlayers = String(data[i][3]);
      var playersArray = currentPlayers.split(',');
      if (playersArray.indexOf(String(playerId)) !== -1) {
        return {error: 'Player already in session'};
      }
      var startingScore = 0;
      if (joinHandNumber > 1) {
        var handsSheet = getSheet('hands');
        var handsData = handsSheet.getDataRange().getValues();
        var playerTotals = {};
        var playerCount = 0;
        for (var h = 1; h < handsData.length; h++) {
          var hand = handsData[h];
          if (String(hand[1]) === String(sessionId) && Number(hand[2]) < joinHandNumber) {
            var handPlayerId = String(hand[3]);
            if (!playerTotals[handPlayerId]) {
              playerTotals[handPlayerId] = 0;
            }
            playerTotals[handPlayerId] += Number(hand[4]);
          }
        }
        var totalSum = 0;
        for (var pid in playerTotals) {
          totalSum += playerTotals[pid];
          playerCount++;
        }
        if (playerCount > 0) {
          startingScore = Math.round(totalSum / playerCount);
        }
      }
      playersArray.push(String(playerId));
      var newPlayers = playersArray.join(',');
      sheet.getRange(i + 1, 4).setValue(newPlayers);
      var joinInfo = {};
      try {
        var currentJoinInfo = String(data[i][8]);
        if (currentJoinInfo && currentJoinInfo !== '') {
          joinInfo = JSON.parse(currentJoinInfo);
        }
      } catch(e) {
        joinInfo = {};
      }
      joinInfo[String(playerId)] = {
        hand: Number(joinHandNumber),
        starting_score: startingScore
      };
      sheet.getRange(i + 1, 9).setValue(JSON.stringify(joinInfo));
      logEdit(editorName, 'ADDED_PLAYER_TO_SESSION', 'session', sessionId);
      return {
        success: true, 
        players_involved: newPlayers, 
        player_join_info: JSON.stringify(joinInfo),
        starting_score: startingScore
      };
    }
  }
  return {error: 'Session not found'};
}

function closeSession(sessionId, editorName) {
  var sheet = getSheet('sessions');
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(sessionId)) {
      var dateEnded = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
      sheet.getRange(i + 1, 6).setValue(dateEnded);
      logEdit(editorName, 'CLOSED', 'session', sessionId);
      return {success: true};
    }
  }
  return {error: 'Session not found'};
}

// ============================================
// HANDS
// ============================================

function getHands(sessionId) {
  var all = sheetToObjects('hands');
  var result = [];
  for (var i = 0; i < all.length; i++) {
    if (String(all[i].session_id) === String(sessionId)) {
      result.push(all[i]);
    }
  }
  return result;
}

function addHand(sessionId, handNumber, scoresJson, lockoutPlayerId, falseLockout, editorName, comment, lockoutScore) {
  var sheet = getSheet('hands');
  var scores = JSON.parse(scoresJson);
  var handComment = comment || '';
  var nextId = getNextId('hands');
  var rowsToAdd = [];
  
  for (var i = 0; i < scores.length; i++) {
    var isLockoutPlayer = (String(scores[i].player_id) === String(lockoutPlayerId));
    var lockoutValue = isLockoutPlayer ? lockoutPlayerId : '';
    var falseValue = (isLockoutPlayer && falseLockout === 'true') ? 1 : 0;
    var lockoutScoreValue = isLockoutPlayer ? (lockoutScore || scores[i].score) : null;
    
    rowsToAdd.push([
      nextId, 
      sessionId, 
      handNumber, 
      scores[i].player_id, 
      scores[i].score, 
      lockoutValue, 
      falseValue, 
      handComment,
      lockoutScoreValue
    ]);
    nextId++;
  }
  
  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 9).setValues(rowsToAdd);
  }
  
  logEdit(editorName, 'ADDED_HAND', 'session', sessionId);
  return {success: true};
}

function updateHand(sessionId, handNumber, scoresJson, lockoutPlayerId, falseLockout, editorName, comment, lockoutScore) {
  var sheet = getSheet('hands');
  var data = sheet.getDataRange().getValues();
  var scores = JSON.parse(scoresJson);
  var handComment = comment || '';
  
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(sessionId) && String(data[i][2]) === String(handNumber)) {
      sheet.deleteRow(i + 1);
    }
  }
  
  var nextId = getNextId('hands');
  var rowsToAdd = [];
  
  for (var i = 0; i < scores.length; i++) {
    var isLockoutPlayer = (String(scores[i].player_id) === String(lockoutPlayerId));
    var lockoutValue = isLockoutPlayer ? lockoutPlayerId : '';
    var falseValue = (isLockoutPlayer && falseLockout === 'true') ? 1 : 0;
    var lockoutScoreValue = isLockoutPlayer ? (lockoutScore || scores[i].score) : null;
    
    rowsToAdd.push([
      nextId, 
      sessionId, 
      handNumber, 
      scores[i].player_id, 
      scores[i].score, 
      lockoutValue, 
      falseValue, 
      handComment,
      lockoutScoreValue
    ]);
    nextId++;
  }
  
  if (rowsToAdd.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, 9).setValues(rowsToAdd);
  }
  
  logEdit(editorName, 'UPDATED_HAND', 'session', sessionId);
  return {success: true};
}

function deleteHand(sessionId, handNumber, editorName) {
  var sheet = getSheet('hands');
  var data = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][1]) === String(sessionId) && String(data[i][2]) === String(handNumber)) {
      sheet.deleteRow(i + 1);
    }
  }
  logEdit(editorName, 'DELETED_HAND', 'session', sessionId);
  return {success: true};
}

function getHandCount(sessionId) {
  var hands = getHands(sessionId);
  if (hands.length === 0) return 0;
  var max = 0;
  for (var i = 0; i < hands.length; i++) {
    if (Number(hands[i].hand_number) > max) {
      max = Number(hands[i].hand_number);
    }
  }
  return max;
}

// ============================================
// EDIT HISTORY
// ============================================

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

// ============================================
// BATCH ENDPOINT FOR PERFORMANCE
// ============================================

function getSessionsWithHands() {
  var sessions = sheetToObjects('sessions');
  var allHands = sheetToObjects('hands');
  var handsBySession = {};
  for (var i = 0; i < allHands.length; i++) {
    var sessionId = String(allHands[i].session_id);
    if (!handsBySession[sessionId]) {
      handsBySession[sessionId] = [];
    }
    handsBySession[sessionId].push(allHands[i]);
  }
  var result = [];
  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i];
    var sessionId = String(session.session_id);
    result.push({
      session: session,
      hands: handsBySession[sessionId] || []
    });
  }
  return result;
}

// ============================================
// HEAD-TO-HEAD STATS
// ============================================

function getHeadToHeadMatrix() {
  var sessions = sheetToObjects('sessions');
  var hands = sheetToObjects('hands');
  
  var h2h = {};
  
  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i];
    
    // Only count completed sessions for head-to-head
    if (!session.date_ended || session.date_ended === '') continue;
    
    var playerIds = String(session.players_involved).split(',');
    
    // Parse join info to get starting scores
    var joinInfo = {};
    try {
      if (session.player_join_info && session.player_join_info !== '' && session.player_join_info !== '{}') {
        var parsed = JSON.parse(session.player_join_info);
        for (var pid in parsed) {
          var info = parsed[pid];
          if (typeof info === 'object' && info.starting_score !== undefined) {
            joinInfo[pid] = info.starting_score;
          }
        }
      }
    } catch(e) {}
    
    // Calculate totals INCLUDING starting scores for late joiners
    var playerTotals = {};
    for (var p = 0; p < playerIds.length; p++) {
      var pid = String(playerIds[p]);
      playerTotals[pid] = joinInfo[pid] || 0;
    }
    
    for (var h = 0; h < hands.length; h++) {
      var hand = hands[h];
      if (String(hand.session_id) === String(session.session_id)) {
        var pid = String(hand.player_id);
        if (playerTotals[pid] !== undefined) {
          playerTotals[pid] += Number(hand.score);
        }
      }
    }
    
    // Compare each pair of players directly
    for (var p1 = 0; p1 < playerIds.length; p1++) {
      for (var p2 = p1 + 1; p2 < playerIds.length; p2++) {
        var id1 = String(playerIds[p1]);
        var id2 = String(playerIds[p2]);
        
        var key = id1 < id2 ? id1 + '_' + id2 : id2 + '_' + id1;
        
        if (!h2h[key]) {
          h2h[key] = {
            p1: id1 < id2 ? id1 : id2,
            p2: id1 < id2 ? id2 : id1,
            p1_wins: 0,
            p2_wins: 0,
            ties: 0,
            sessions_together: 0
          };
        }
        
        h2h[key].sessions_together++;
        
        // Compare their scores directly
        var score1 = playerTotals[id1];
        var score2 = playerTotals[id2];
        
        if (score1 < score2) {
          // id1 beat id2 (lower score wins)
          if (id1 === h2h[key].p1) {
            h2h[key].p1_wins++;
          } else {
            h2h[key].p2_wins++;
          }
        } else if (score2 < score1) {
          // id2 beat id1
          if (id2 === h2h[key].p1) {
            h2h[key].p1_wins++;
          } else {
            h2h[key].p2_wins++;
          }
        } else {
          // Tied
          h2h[key].ties++;
        }
      }
    }
  }
  
  return Object.values(h2h);
}

// ============================================
// PLAYER COMPARISON (DETAILED)
// ============================================

function getPlayerComparisonDetailed(player1Id, player2Id) {
  var sessions = sheetToObjects('sessions');
  var hands = sheetToObjects('hands');
  
  var sessionsTogetherData = [];
  var allSessionsData = {
    player1: [],
    player2: []
  };
  
  for (var i = 0; i < sessions.length; i++) {
    var session = sessions[i];
    if (!session.date_ended || session.date_ended === '') continue;
    
    var playerIds = String(session.players_involved).split(',');
    
    // Parse join info to check for late joiners
    var lateJoiners = [];
    var joinInfo = {};
    try {
      if (session.player_join_info && session.player_join_info !== '' && session.player_join_info !== '{}') {
        var parsed = JSON.parse(session.player_join_info);
        for (var pid in parsed) {
          lateJoiners.push(String(pid));
          var info = parsed[pid];
          if (typeof info === 'object' && info.starting_score !== undefined) {
            joinInfo[pid] = info.starting_score;
          }
        }
      }
    } catch(e) {}
    
    // Combine original players and late joiners
    var allPlayerIds = playerIds.slice(); // Copy array
    for (var j = 0; j < lateJoiners.length; j++) {
      if (allPlayerIds.indexOf(lateJoiners[j]) === -1) {
        allPlayerIds.push(lateJoiners[j]);
      }
    }
    
    // Check if players participated (including late joiners)
    var p1InSession = allPlayerIds.indexOf(String(player1Id)) !== -1;
    var p2InSession = allPlayerIds.indexOf(String(player2Id)) !== -1;
    
    var sessionHands = [];
    for (var h = 0; h < hands.length; h++) {
      if (String(hands[h].session_id) === String(session.session_id)) {
        sessionHands.push(hands[h]);
      }
    }
    
    // Calculate totals INCLUDING starting scores
    var playerTotals = {};
    for (var p = 0; p < allPlayerIds.length; p++) {
      var pid = String(allPlayerIds[p]);
      playerTotals[pid] = joinInfo[pid] || 0;
    }
    
    for (var h = 0; h < sessionHands.length; h++) {
      var hand = sessionHands[h];
      var pid = String(hand.player_id);
      if (playerTotals[pid] !== undefined) {
        playerTotals[pid] += Number(hand.score);
      }
    }
    
    var lowestScore = Infinity;
    for (var pid in playerTotals) {
      if (playerTotals[pid] < lowestScore) {
        lowestScore = playerTotals[pid];
      }
    }
    
    var winners = [];
    for (var pid in playerTotals) {
      if (playerTotals[pid] === lowestScore) {
        winners.push(pid);
      }
    }
    
    if (p1InSession && p2InSession) {
      var p1Hands = [];
      var p2Hands = [];
      
      for (var h = 0; h < sessionHands.length; h++) {
        var hand = sessionHands[h];
        if (String(hand.player_id) === String(player1Id)) {
          p1Hands.push(hand);
        }
        if (String(hand.player_id) === String(player2Id)) {
          p2Hands.push(hand);
        }
      }
      
      // Compare p1 vs p2 directly
      var p1Score = playerTotals[player1Id] || 0;
      var p2Score = playerTotals[player2Id] || 0;
      var p1Won = p1Score < p2Score;
      var p2Won = p2Score < p1Score;
      var isTie = p1Score === p2Score;
      
      sessionsTogetherData.push({
        session_id: session.session_id,
        title: session.title,
        date: session.date_started,
        player_count: allPlayerIds.length, // Use allPlayerIds to include late joiners
        other_players: allPlayerIds.filter(function(pid) {
          return String(pid) !== String(player1Id) && String(pid) !== String(player2Id);
        }),
        p1_won: p1Won,
        p2_won: p2Won,
        is_tie: isTie,
        p1_score: p1Score,
        p2_score: p2Score,
        p1_hands: p1Hands,
        p2_hands: p2Hands
      });
    }
    
    if (p1InSession) {
      var p1SessionHands = [];
      for (var h = 0; h < sessionHands.length; h++) {
        if (String(sessionHands[h].player_id) === String(player1Id)) {
          p1SessionHands.push(sessionHands[h]);
        }
      }
      
      allSessionsData.player1.push({
        session_id: session.session_id,
        title: session.title,
        date: session.date_started,
        player_count: allPlayerIds.length,
        p1_won: winners.indexOf(String(player1Id)) !== -1,
        is_tie: winners.length > 1 && winners.indexOf(String(player1Id)) !== -1,
        p1_score: playerTotals[player1Id] || 0,
        p1_hands: p1SessionHands
      });
    }
    
    if (p2InSession) {
      var p2SessionHands = [];
      for (var h = 0; h < sessionHands.length; h++) {
        if (String(sessionHands[h].player_id) === String(player2Id)) {
          p2SessionHands.push(sessionHands[h]);
        }
      }
      
      allSessionsData.player2.push({
        session_id: session.session_id,
        title: session.title,
        date: session.date_started,
        player_count: allPlayerIds.length,
        p2_won: winners.indexOf(String(player2Id)) !== -1,
        is_tie: winners.length > 1 && winners.indexOf(String(player2Id)) !== -1,
        p2_score: playerTotals[player2Id] || 0,
        p2_hands: p2SessionHands
      });
    }
  }
  
  var togetherStats = calculateDetailedComparisonStats(sessionsTogetherData, player1Id, player2Id);
  var allSessionsStats = {
    player1: calculateDetailedPlayerStats(allSessionsData.player1, player1Id),
    player2: calculateDetailedPlayerStats(allSessionsData.player2, player2Id)
  };
  
  return {
    player1_id: player1Id,
    player2_id: player2Id,
    sessions_together: sessionsTogetherData,
    sessions_together_stats: togetherStats,
    all_sessions_player1: allSessionsData.player1,
    all_sessions_player2: allSessionsData.player2,
    all_sessions_stats: allSessionsStats
  };
}

function calculateDetailedComparisonStats(sessionsData, player1Id, player2Id) {
  var p1Wins = 0, p2Wins = 0, ties = 0;
  var p1TotalScore = 0, p2TotalScore = 0;
  var p1TotalHands = 0, p2TotalHands = 0;
  var p1Lockouts = 0, p2Lockouts = 0;
  var p1LockoutScores = [], p2LockoutScores = [];
  var p1FalseLockouts = 0, p2FalseLockouts = 0;
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
        if (hand.false_lockout == 1 || hand.false_lockout === true) {
          p1FalseLockouts++;
        } else {
          p1Lockouts++;
          var lockoutScore = hand.lockout_score ? Number(hand.lockout_score) : Number(hand.score);
          p1LockoutScores.push(lockoutScore);
        }
      }
    }
    
    for (var h = 0; h < s.p2_hands.length; h++) {
      var hand = s.p2_hands[h];
      p2TotalScore += Number(hand.score);
      p2TotalHands++;
      
      if (hand.lockout_player_id && String(hand.lockout_player_id) === String(player2Id)) {
        p2TotalLockouts++;
        if (hand.false_lockout == 1 || hand.false_lockout === true) {
          p2FalseLockouts++;
        } else {
          p2Lockouts++;
          var lockoutScore = hand.lockout_score ? Number(hand.lockout_score) : Number(hand.score);
          p2LockoutScores.push(lockoutScore);
        }
      }
    }
    
    for (var j = 0; j < s.other_players.length; j++) {
      var otherId = s.other_players[j];
      if (!contextMap[otherId]) {
        contextMap[otherId] = { p1_wins: 0, p2_wins: 0, total: 0 };
      }
      contextMap[otherId].total++;
      if (s.p1_won && !s.p2_won) contextMap[otherId].p1_wins++;
      if (s.p2_won && !s.p1_won) contextMap[otherId].p2_wins++;
    }
  }
  
  var totalSessions = p1Wins + p2Wins + ties;
  var p1WinRate = totalSessions > 0 ? (p1Wins / totalSessions) * 100 : 0;
  var p2WinRate = totalSessions > 0 ? (p2Wins / totalSessions) * 100 : 0;
  
  var p1AvgHand = p1TotalHands > 0 ? p1TotalScore / p1TotalHands : 0;
  var p2AvgHand = p2TotalHands > 0 ? p2TotalScore / p2TotalHands : 0;
  
  var p1LockoutRate = p1TotalHands > 0 ? (p1Lockouts / p1TotalHands) * 100 : 0;
  var p2LockoutRate = p2TotalHands > 0 ? (p2Lockouts / p2TotalHands) * 100 : 0;
  
  var p1AvgLockout = p1LockoutScores.length > 0 ? p1LockoutScores.reduce(function(a,b) { return a+b; }) / p1LockoutScores.length : 0;
  var p2AvgLockout = p2LockoutScores.length > 0 ? p2LockoutScores.reduce(function(a,b) { return a+b; }) / p2LockoutScores.length : 0;
  
  var p1FalseLockoutRate = p1TotalLockouts > 0 ? (p1FalseLockouts / p1TotalLockouts) * 100 : 0;
  var p2FalseLockoutRate = p2TotalLockouts > 0 ? (p2FalseLockouts / p2TotalLockouts) * 100 : 0;
  
  var bestWith = null, worstWith = null;
  var bestRate = -1, worstRate = 101;
  
  for (var otherId in contextMap) {
    var ctx = contextMap[otherId];
    var rate = ctx.total > 0 ? (ctx.p1_wins / ctx.total) * 100 : 0;
    if (rate > bestRate) {
      bestRate = rate;
      bestWith = { player_id: otherId, wins: ctx.p1_wins, total: ctx.total };
    }
    if (rate < worstRate) {
      worstRate = rate;
      worstWith = { player_id: otherId, wins: ctx.p1_wins, total: ctx.total };
    }
  }
  
  return {
    p1_wins: p1Wins,
    p2_wins: p2Wins,
    ties: ties,
    total_sessions: totalSessions,
    p1_win_rate: p1WinRate.toFixed(1),
    p2_win_rate: p2WinRate.toFixed(1),
    p1_total_score: p1TotalScore,
    p2_total_score: p2TotalScore,
    p1_total_hands: p1TotalHands,
    p2_total_hands: p2TotalHands,
    p1_avg_hand: p1AvgHand.toFixed(2),
    p2_avg_hand: p2AvgHand.toFixed(2),
    p1_lockouts: p1Lockouts,
    p2_lockouts: p2Lockouts,
    p1_lockout_rate: p1LockoutRate.toFixed(1),
    p2_lockout_rate: p2LockoutRate.toFixed(1),
    p1_avg_lockout: p1AvgLockout.toFixed(2),
    p2_avg_lockout: p2AvgLockout.toFixed(2),
    p1_false_lockouts: p1FalseLockouts,
    p2_false_lockouts: p2FalseLockouts,
    p1_false_lockout_rate: p1FalseLockoutRate.toFixed(1),
    p2_false_lockout_rate: p2FalseLockoutRate.toFixed(1),
    best_with: bestWith,
    worst_with: worstWith
  };
}

function calculateDetailedPlayerStats(sessionsData, playerId) {
  var wins = 0, ties = 0;
  var totalScore = 0, totalHands = 0;
  var lockouts = 0, lockoutScores = [];
  var falseLockouts = 0, totalLockouts = 0;
  
  for (var i = 0; i < sessionsData.length; i++) {
    var s = sessionsData[i];
    
    if (s.p1_won || s.p2_won) {
      if (s.p1_won) wins++;
      if (s.is_tie) ties++;
    }
    
    var handsArray = s.p1_hands || s.p2_hands || [];
    
    for (var h = 0; h < handsArray.length; h++) {
      var hand = handsArray[h];
      totalScore += Number(hand.score);
      totalHands++;
      
      if (hand.lockout_player_id && String(hand.lockout_player_id) === String(playerId)) {
        totalLockouts++;
        if (hand.false_lockout == 1 || hand.false_lockout === true) {
          falseLockouts++;
        } else {
          lockouts++;
          var lockoutScore = hand.lockout_score ? Number(hand.lockout_score) : Number(hand.score);
          lockoutScores.push(lockoutScore);
        }
      }
    }
  }
  
  var totalSessions = sessionsData.length;
  var winRate = totalSessions > 0 ? (wins / totalSessions) * 100 : 0;
  var avgHand = totalHands > 0 ? totalScore / totalHands : 0;
  var lockoutRate = totalHands > 0 ? (lockouts / totalHands) * 100 : 0;
  var avgLockout = lockoutScores.length > 0 ? lockoutScores.reduce(function(a,b) { return a+b; }) / lockoutScores.length : 0;
  var falseLockoutRate = totalLockouts > 0 ? (falseLockouts / totalLockouts) * 100 : 0;
  
  return {
    wins: wins,
    losses: totalSessions - wins - ties,
    ties: ties,
    total_sessions: totalSessions,
    win_rate: winRate.toFixed(1),
    total_score: totalScore,
    total_hands: totalHands,
    avg_hand: avgHand.toFixed(2),
    lockouts: lockouts,
    lockout_rate: lockoutRate.toFixed(1),
    avg_lockout: avgLockout.toFixed(2),
    false_lockouts: falseLockouts,
    false_lockout_rate: falseLockoutRate.toFixed(1)
  };
}
