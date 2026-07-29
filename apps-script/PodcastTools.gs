// Private spreadsheet-owner tools for preparing NotebookLM sources.
// Nothing in this file is routed through the public web API.

var PODCAST_PACK_FOLDER = 'Lockout Podcast Packs';

function adminGenerateLastWeekPodcastPack() {
  var range = podcastPreviousMondayToSunday(new Date());
  podcastCreateAndShowPack(range.start, range.end);
}

function adminGeneratePodcastPackPrompt() {
  var ui = SpreadsheetApp.getUi();
  var response = ui.prompt(
    'Generate podcast pack',
    'Enter the Monday and Sunday as YYYY-MM-DD to YYYY-MM-DD.\nExample: 2026-07-13 to 2026-07-19',
    ui.ButtonSet.OK_CANCEL
  );
  if (response.getSelectedButton() !== ui.Button.OK) return;
  var match = String(response.getResponseText() || '').trim()
    .match(/^(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})$/i);
  if (!match) {
    ui.alert('Use this format: 2026-07-13 to 2026-07-19');
    return;
  }
  var start = podcastParseIsoDate(match[1]);
  var end = podcastParseIsoDate(match[2]);
  if (!start || !end || start.getTime() > end.getTime()) {
    ui.alert('Those dates are not valid.');
    return;
  }
  podcastCreateAndShowPack(start, end);
}

function adminCreatePodcastBible() {
  var content = podcastBibleText();
  var file = podcastCreateTextFile('Lockout-Podcast-Bible.txt', content);
  SpreadsheetApp.getUi().alert(
    'Podcast Bible created.\n\nAdd this to The Lockout Weekly notebook once:\n' + file.getUrl()
  );
}

function podcastCreateAndShowPack(start, end) {
  var ui = SpreadsheetApp.getUi();
  try {
    var result = podcastGenerateWeeklyPack(start, end);
    var file = podcastCreateTextFile(result.filename, result.content);
    ui.alert(
      'Podcast pack created for ' + result.period + '.\n\n' +
      'Add this file as a new source in the same NotebookLM notebook:\n' +
      file.getUrl() + '\n\n' +
      'Sessions included: ' + result.sessionCount
    );
  } catch (err) {
    ui.alert('The podcast pack could not be created:\n' + err.message);
    throw err;
  }
}

function podcastGenerateWeeklyPack(start, end) {
  v2ResetExecutionSheetCache(true);
  try {
    var players = sheetToObjects('players');
    var sessions = sheetToObjects('sessions');
    var hands = sheetToObjects('hands');
    var elo = sheetToObjects('elo_history');
    var names = {};
    players.forEach(function(player) {
      names[String(player.player_id)] = String(player.username || ('Player ' + player.player_id));
    });

    var startDay = podcastStartOfDay(start);
    var endExclusive = podcastStartOfDay(end);
    endExclusive.setDate(endExclusive.getDate() + 1);
    var official = sessions.filter(isOfficialCompletedSession).sort(podcastSessionSort);
    var weekly = official.filter(function(session) {
      var date = podcastSessionDate(session);
      return date && date >= startDay && date < endExclusive;
    });
    if (!weekly.length) throw new Error('No official completed sessions were found in that period.');

    var previous = official.filter(function(session) {
      var date = podcastSessionDate(session);
      return date && date < startDay;
    });
    var weeklyIds = {};
    weekly.forEach(function(session) { weeklyIds[String(session.session_id)] = true; });
    var weeklyHands = hands.filter(function(hand) { return weeklyIds[String(hand.session_id)]; });
    var weeklyElo = elo.filter(function(row) { return weeklyIds[String(row.session_id)]; });
    var summaries = weekly.map(function(session) {
      return podcastSummariseSession(session, hands, weeklyElo, names);
    });
    var aggregate = podcastWeeklyAggregate(summaries, weeklyHands, weeklyElo, names);
    var context = podcastHistoricalContext(summaries, previous, hands, names);
    var metadata = podcastSuggestedMetadata(summaries, aggregate, startDay, end, names);
    var content = podcastRenderWeeklyPack(
      startDay, end, summaries, aggregate, context, metadata, names
    );
    return {
      filename: 'lockout-weekly-' + podcastIso(startDay) + '-to-' + podcastIso(end) + '.txt',
      content: content,
      period: podcastDisplayDate(startDay) + ' to ' + podcastDisplayDate(end),
      sessionCount: weekly.length
    };
  } finally {
    v2ResetExecutionSheetCache(false);
  }
}

function podcastSummariseSession(session, allHands, weeklyElo, names) {
  var sessionId = String(session.session_id);
  var rows = allHands.filter(function(hand) { return String(hand.session_id) === sessionId; });
  var playerIds = getSessionPlayedPlayerIds(session, rows);
  var joinInfo = parseJoinInfo(session);
  var totals = {};
  playerIds.forEach(function(id) { totals[id] = Number(joinInfo[id] || 0); });
  rows.forEach(function(row) {
    var id = String(row.player_id);
    if (totals[id] === undefined) totals[id] = Number(joinInfo[id] || 0);
    totals[id] += Number(row.score || 0);
  });
  var positions = playerIds.slice().sort(function(a, b) {
    return totals[a] - totals[b] || String(names[a]).localeCompare(String(names[b]));
  });
  var handNumbers = [];
  rows.forEach(function(row) {
    var number = Number(row.hand_number);
    if (handNumbers.indexOf(number) < 0) handNumbers.push(number);
  });
  handNumbers.sort(function(a, b) { return a - b; });
  var eloRows = weeklyElo.filter(function(row) { return String(row.session_id) === sessionId; });
  return {
    session: session,
    rows: rows,
    playerIds: playerIds,
    totals: totals,
    positions: positions,
    handNumbers: handNumbers,
    eloRows: eloRows,
    joinInfo: joinInfo
  };
}

function podcastWeeklyAggregate(summaries, weeklyHands, weeklyElo, names) {
  var appearances = {};
  var wins = {};
  var eloNet = {};
  summaries.forEach(function(summary) {
    summary.playerIds.forEach(function(id) {
      appearances[id] = (appearances[id] || 0) + 1;
    });
    var winningScore = summary.totals[summary.positions[0]];
    summary.positions.forEach(function(id) {
      if (summary.totals[id] === winningScore) wins[id] = (wins[id] || 0) + 1;
    });
  });
  weeklyElo.forEach(function(row) {
    var id = String(row.player_id);
    eloNet[id] = (eloNet[id] || 0) + Number(row.change || 0);
  });
  var playerIds = Object.keys(appearances);
  var handKeys = {};
  weeklyHands.forEach(function(row) {
    handKeys[String(row.session_id) + '|' + String(row.hand_number)] = true;
  });
  return {
    appearances: appearances,
    wins: wins,
    eloNet: eloNet,
    playerIds: playerIds,
    handCount: Object.keys(handKeys).length,
    successful: weeklyHands.filter(function(row) {
      return String(row.lockout_player_id || '') &&
        !podcastTruthy(row.false_lockout);
    }).length,
    falseCount: weeklyHands.filter(function(row) {
      return String(row.lockout_player_id || '') &&
        podcastTruthy(row.false_lockout);
    }).length,
    leadingWinner: playerIds.slice().sort(function(a, b) {
      return (wins[b] || 0) - (wins[a] || 0) ||
        (eloNet[b] || 0) - (eloNet[a] || 0) ||
        String(names[a]).localeCompare(String(names[b]));
    })[0]
  };
}

function podcastHistoricalContext(summaries, previousSessions, allHands, names) {
  if (!previousSessions.length) {
    return ['This is the opening recorded week, so no earlier official context is available.'];
  }
  var weeklyPlayers = {};
  summaries.forEach(function(summary) {
    summary.playerIds.forEach(function(id) { weeklyPlayers[id] = true; });
  });
  var previousSummaries = previousSessions.map(function(session) {
    return podcastSummariseSession(session, allHands, [], names);
  });
  var lines = [];
  Object.keys(weeklyPlayers).forEach(function(playerId) {
    var appearances = previousSummaries.filter(function(summary) {
      return summary.playerIds.indexOf(playerId) >= 0;
    });
    if (!appearances.length) {
      lines.push(names[playerId] + ' made their first official recorded appearance this week.');
      return;
    }
    var streak = 0;
    for (var i = appearances.length - 1; i >= 0; i--) {
      var summary = appearances[i];
      var best = summary.totals[summary.positions[0]];
      if (summary.totals[playerId] !== best) break;
      streak++;
    }
    if (streak >= 2) {
      lines.push(names[playerId] + ' entered the week having won ' + streak + ' consecutive appearances.');
    }
    var last = appearances[appearances.length - 1];
    if (last) {
      lines.push(
        names[playerId] + '’s previous appearance was ' + String(last.session.title || 'an unnamed session') +
        ', finishing on ' + last.totals[playerId] + '.'
      );
    }
  });
  return lines.slice(0, 10);
}

function podcastSuggestedMetadata(summaries, aggregate, start, end, names) {
  var leaderName = aggregate.leadingWinner ? names[aggregate.leadingWinner] : '';
  var title = leaderName
    ? leaderName + ' Takes the Week'
    : 'Another Entirely Normal Week';
  var description = summaries.length + ' session' + (summaries.length === 1 ? '' : 's') +
    ', ' + aggregate.handCount + ' hands and ' +
    (aggregate.successful + aggregate.falseCount) +
    ' declarations receive the level of analysis they clearly deserve.';
  return {
    titles: [
      title,
      'The Week in Lockout',
      summaries[0] ? String(summaries[0].session.title || 'Lockout Takes Centre Stage') : 'Lockout Takes Centre Stage'
    ],
    description: description,
    date: podcastIso(end),
    filename: 'episode-' + podcastIso(start) + '-to-' + podcastIso(end) + '.m4a'
  };
}

function podcastRenderWeeklyPack(start, end, summaries, aggregate, context, metadata, names) {
  var out = [];
  out.push('THE LOCKOUT WEEKLY — WEEKLY PODCAST PACK');
  out.push('');
  out.push('PERIOD');
  out.push(podcastDisplayDate(start) + ' to ' + podcastDisplayDate(end));
  out.push('');
  out.push('EDITORIAL INSTRUCTIONS');
  out.push('Use this as the main source for the latest episode of The Lockout Weekly.');
  out.push('Treat earlier weekly packs in the notebook as established history and use them only when they add useful context.');
  out.push('The audience already understands Lockout. Do not explain basic scoring.');
  out.push('Use an affectionate, distinctly British, dry and knowingly over-serious sports-roundup tone.');
  out.push('Aim for understated wit, gentle incredulity and the rhythm of a familiar British radio or television sports recap.');
  out.push('Use British English. Avoid American sports-show hype, forced British slang and exaggerated accents.');
  out.push('Preserve the charm of a homemade project between friends. Avoid corporate language and forced jokes.');
  out.push('Prioritise stories, turning points, streaks, collapses and statistical oddities over reading lists of numbers.');
  out.push('Never invent events, quotations, motives, reactions, personalities, nicknames or rivalries.');
  out.push('');
  out.push('WEEK AT A GLANCE');
  out.push('- ' + summaries.length + ' official completed session' + (summaries.length === 1 ? '' : 's') + '.');
  out.push('- ' + aggregate.handCount + ' hands involving ' + aggregate.playerIds.length + ' players.');
  out.push('- ' + aggregate.successful + ' successful lockouts and ' + aggregate.falseCount + ' false lockouts.');
  aggregate.playerIds.slice().sort(function(a, b) {
    return (aggregate.wins[b] || 0) - (aggregate.wins[a] || 0);
  }).forEach(function(id) {
    out.push(
      '- ' + names[id] + ': ' + aggregate.appearances[id] + ' appearance' +
      (aggregate.appearances[id] === 1 ? '' : 's') + ', ' +
      (aggregate.wins[id] || 0) + ' win' + ((aggregate.wins[id] || 0) === 1 ? '' : 's') +
      ', net Elo ' + podcastSigned(aggregate.eloNet[id] || 0) + '.'
    );
  });
  out.push('');
  out.push('RELEVANT PREVIOUS CONTEXT');
  if (context.length) context.forEach(function(line) { out.push('- ' + line); });
  else out.push('- This is the opening recorded week, so no earlier official context is available.');
  out.push('');
  out.push('SESSION REPORTS');
  summaries.forEach(function(summary) {
    podcastRenderSession(out, summary, names);
  });
  out.push('');
  out.push('SUGGESTED APP LISTING');
  out.push('Title options:');
  metadata.titles.forEach(function(title, index) { out.push((index + 1) + '. ' + title); });
  out.push('Suggested description: ' + metadata.description);
  out.push('Episode date: ' + metadata.date);
  out.push('Suggested audio filename: ' + metadata.filename);
  out.push('');
  out.push('REUSABLE NOTEBOOKLM AUDIO INSTRUCTION');
  out.push('Produce a two-to-three-minute episode of The Lockout Weekly using this latest weekly pack as the main story and earlier packs only for useful context. Assume regular listeners understand the game; do not explain basic scoring. Cover the strongest results, turning points, form and statistical oddities. Maintain continuity without laboriously recapping previous episodes. Use British English and an affectionate, dry, understated and knowingly over-serious British sports-broadcast tone. Avoid American-style hype, forced British slang and exaggerated accents. Do not invent facts, quotes, events, personalities or nicknames. Start with the strongest hook and finish with a brief look ahead.');
  return out.join('\n');
}

function podcastRenderSession(out, summary, names) {
  var session = summary.session;
  var winners = [];
  var best = summary.totals[summary.positions[0]];
  summary.positions.forEach(function(id) {
    if (summary.totals[id] === best) winners.push(names[id]);
  });
  out.push('');
  out.push(String(session.title || 'Untitled session') + ' — ' + podcastDisplayDate(podcastSessionDate(session)));
  out.push('Winner: ' + winners.join(' and ') + '. Hands: ' + summary.handNumbers.length + '.');
  out.push('Final scores: ' + summary.positions.map(function(id) {
    var late = summary.joinInfo[id] !== undefined ? ' (joined late with ' + summary.joinInfo[id] + ')' : '';
    return names[id] + ' ' + summary.totals[id] + late;
  }).join(', ') + '.');
  var eloText = summary.eloRows.map(function(row) {
    return names[String(row.player_id)] + ' ' + podcastSigned(Number(row.change || 0));
  }).join(', ');
  if (eloText) out.push('Recorded Elo changes: ' + eloText + '.');
  if (String(session.notes || '').trim()) out.push('Recorded session note: ' + String(session.notes).trim());
  out.push('Hand-by-hand:');
  summary.handNumbers.forEach(function(number) {
    var rows = summary.rows.filter(function(row) { return Number(row.hand_number) === number; });
    var scores = rows.map(function(row) { return names[String(row.player_id)] + ' ' + row.score; }).join(', ');
    var declaration = rows.filter(function(row) { return String(row.lockout_player_id || ''); })[0];
    var detail = '';
    if (declaration) {
      detail = ' ' + names[String(declaration.lockout_player_id)] +
        (podcastTruthy(declaration.false_lockout) ? ' made a false lockout' : ' locked out successfully') +
        ' at ' + getLockoutScore(declaration) + '.';
    }
    var comment = rows.filter(function(row) { return String(row.comment || '').trim(); })[0];
    if (comment) detail += ' Recorded comment: “' + String(comment.comment).trim() + '”.';
    out.push('- Hand ' + number + ': ' + scores + '.' + detail);
  });
}

function podcastBibleText() {
  return [
    'THE LOCKOUT WEEKLY — PODCAST BIBLE',
    '',
    'SERIES PREMISE',
    'The Lockout Weekly is a homemade recurring sports-style recap of Lockout games played between friends.',
    'Its central joke is that ordinary social games receive the sort of statistical attention normally reserved for major sport.',
    '',
    'VOICE AND TONE',
    '- Warm, dry, affectionate, distinctly British and knowingly over-serious.',
    '- Use British English, understated wit and gentle incredulity.',
    '- Sound closer to a familiar British radio or television sports roundup than an American sports show.',
    '- Avoid forced British slang, parody accents, laddishness and breathless hype.',
    '- Confident enough to sound like an established weekly programme.',
    '- Keep the homemade charm; avoid corporate polish, forced jokes and excessive hype.',
    '- Teasing must remain friendly and supported by recorded events.',
    '',
    'AUDIENCE',
    '- Speak to imaginary regular listeners who already understand Lockout.',
    '- Do not explain basic scoring.',
    '- Do not repeatedly introduce the podcast after the opening episode.',
    '',
    'EDITORIAL APPROACH',
    '- Lead with the week’s strongest story.',
    '- Use numbers to explain a story, not as a list to be read aloud.',
    '- Prefer turning points, streaks, reversals, collapses, comebacks and statistical oddities.',
    '- Use previous weeks for short, natural callbacks when relevant.',
    '- Finish with a brief unresolved question or look ahead.',
    '',
    'ACCURACY',
    '- Never invent events, quotations, motives, reactions, personalities, nicknames or rivalries.',
    '- Treat only official completed sessions as results.',
    '- Respect recorded late-join starting scores and false-lockout penalties.',
    '',
    'APP REFERENCE',
    'The Rules, Dictionary and How to Play sections of the Lockout Tracker remain the authority for terminology and group-specific humour.'
  ].join('\n');
}

function podcastCreateTextFile(filename, content) {
  var iterator = DriveApp.getFoldersByName(PODCAST_PACK_FOLDER);
  var folder = iterator.hasNext() ? iterator.next() : DriveApp.createFolder(PODCAST_PACK_FOLDER);
  return folder.createFile(filename, content, MimeType.PLAIN_TEXT);
}

function podcastPreviousMondayToSunday(now) {
  var today = podcastStartOfDay(now);
  var day = today.getDay();
  var daysSinceMonday = (day + 6) % 7;
  var currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - daysSinceMonday);
  var previousMonday = new Date(currentMonday);
  previousMonday.setDate(currentMonday.getDate() - 7);
  var previousSunday = new Date(currentMonday);
  previousSunday.setDate(currentMonday.getDate() - 1);
  return { start: previousMonday, end: previousSunday };
}

function podcastSessionDate(session) {
  var value = session.date_started || session.date_ended;
  var date = value instanceof Date ? new Date(value) : new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function podcastSessionSort(a, b) {
  var aDate = podcastSessionDate(a);
  var bDate = podcastSessionDate(b);
  return (aDate ? aDate.getTime() : 0) - (bDate ? bDate.getTime() : 0) ||
    Number(a.session_id) - Number(b.session_id);
}

function podcastStartOfDay(value) {
  var date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function podcastParseIsoDate(value) {
  var match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  var date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (date.getFullYear() !== Number(match[1]) ||
      date.getMonth() !== Number(match[2]) - 1 ||
      date.getDate() !== Number(match[3])) return null;
  return date;
}

function podcastIso(value) {
  return Utilities.formatDate(new Date(value), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function podcastDisplayDate(value) {
  return Utilities.formatDate(new Date(value), Session.getScriptTimeZone(), 'd MMMM yyyy');
}

function podcastSigned(value) {
  var number = Number(value || 0);
  return number > 0 ? '+' + number : String(number);
}

function podcastTruthy(value) {
  return value === true || value == 1 || String(value).toLowerCase() === 'true';
}
