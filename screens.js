const Screens = {
    // ============================================
    // HOME SCREEN
    // ============================================
    async renderHome() {
        return `
            <div class="header">
                <h1 onclick="App.handleHeaderClick(event)">🎴 Lockout Tracker</h1>
                <p>Track your games, dominate the leaderboard</p>
            </div>
            <div class="card">
                <h2>Welcome!</h2>
                <div id="activeSessionsSection">
                    <div class="loading">Loading active sessions...</div>
                </div>
                <button class="btn" onclick="App.showScreen('startSession')">🎮 Start New Session</button>
                <button class="btn btn-secondary" onclick="App.showScreen('previousSessions')">📊 View Previous Sessions</button>
                <button class="btn btn-secondary" onclick="App.showScreen('stats')">📈 View Stats</button>
                <button class="btn btn-secondary" onclick="App.showScreen('addPlayer')">➕ Add New Player</button>
                <button class="btn btn-info" onclick="App.showScreen('instructions')">📱 How to Use App</button>
                <button class="btn btn-info" onclick="App.showScreen('dictionary')">📖 Dictionary</button>
                <button class="btn btn-info" onclick="App.showScreen('rules')">📜 Rules</button>
            </div>
        `;
    },

    // ============================================
    // ADD PLAYER SCREEN
    // ============================================
    renderAddPlayer() {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2>Add New Player</h2>
                <label for="newPlayerName">Player Name</label>
                <input type="text" id="newPlayerName" placeholder="Enter player name">
                <button class="btn btn-success" onclick="App.addPlayer()">Add Player</button>
                <button class="btn btn-secondary" onclick="App.showScreen('home')">Back</button>
                <div id="addPlayerMessage"></div>
            </div>
        `;
    },

    // ============================================
    // START SESSION SCREEN
    // ============================================
    renderStartSession(players) {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2>Start New Session</h2>
                <label for="sessionTitle">Session Title</label>
                <input type="text" id="sessionTitle" placeholder="e.g. Magaluf 2024">
                
                <label for="sessionHost">Who's hosting?</label>
                <select id="sessionHost">
                    <option value="">Select host...</option>
                    ${players.map(p => `<option value="${p.player_id}">${p.username}</option>`).join('')}
                </select>
                
                <label for="sessionNotes">Session Notes (Optional)</label>
                <textarea id="sessionNotes" placeholder="e.g. Playing at John's house, bring snacks"></textarea>
                
                <label for="sessionTags">Session Type (Optional)</label>
                ${Components.sessionTagsDropdown()}
                
                <label for="falseLockoutPenalty">False Lockout Penalty</label>
                <input type="number" id="falseLockoutPenalty" placeholder="e.g. 10" value="10" min="0">
                <small style="color: #666; display: block; margin-top: 5px;">
                    Points added to score when a lockout attempt fails
                </small>
                
                <label>Select Players</label>
                <div id="playerSelectionList">
                    ${Components.playerCheckboxList(players)}
                </div>
                
                <button class="btn btn-success" onclick="App.createSession()">Start Session</button>
                <button class="btn btn-secondary" onclick="App.showScreen('home')">Cancel</button>
                <div id="sessionMessage"></div>
            </div>
        `;
    },

    // ============================================
    // ACTIVE SESSION SCREEN
    // ============================================
    renderActiveSession(session, players, handNumber) {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2 id="activeSessionTitle">${session.title}</h2>
                <div id="activeSessionInfo">
                    <p><strong>Session ID:</strong> ${session.session_id}</p>
                    <p><strong>Players:</strong> ${players.map(p => {
                        const joinHand = getPlayerJoinHand(p.player_id, session);
                        return p.username + (joinHand > 1 ? ` <span class="late-join-badge">Joined H${joinHand}</span>` : '');
                    }).join(', ')}</p>
                </div>
                <div id="activeSessionMetadata"></div>
                
                <div class="hand-input-section">
                    <h4>Hand <span id="currentHandNumber">${handNumber}</span></h4>
                    <p style="background: #fff3cd; padding: 10px; border-radius: 5px; margin: 10px 0; font-size: 0.9em;">
                        <strong>ℹ️ Instructions:</strong> Enter each player's score, then select who locked out. 
                        The app will automatically calculate if it was successful or false.
                    </p>
                    <div id="handInputs"></div>
                    <div id="lockoutWarning" class="lockout-warning" style="display: none;"></div>
                    <label for="handComment" style="margin-top: 15px;">Hand Note (Optional)</label>
                    <input type="text" id="handComment" placeholder="e.g. Epic comeback, close call...">
                    <button class="btn btn-success" onclick="App.submitHand()">Submit Hand</button>
                    <div id="handMessage"></div>
                </div>
                
                <div id="handHistorySection" class="hand-history" style="display: none;">
                    <h4>Hand History</h4>
                    <div id="handHistoryList"></div>
                </div>
                
                <div id="sessionScores" class="game-summary"></div>
                <div id="activeSessionCharts"></div>
                
                <div class="nav-buttons">
                    <button class="btn btn-info btn-small" onclick="App.showAddPlayerModal()">➕ Add Player</button>
                    <button class="btn btn-warning btn-small" onclick="App.showEditSessionModal()">✏️ Edit Session</button>
                    <button class="btn btn-secondary" onclick="App.showScreen('home')">Back to Home</button>
                    <button class="btn btn-danger" onclick="App.endSession()">End Session</button>
                </div>
            </div>
        `;
    },

    // ============================================
    // PREVIOUS SESSIONS SCREEN
    // ============================================
    renderPreviousSessions() {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2>Previous Sessions</h2>
                <div id="previousSessionsContent">
                    ${Components.skeletonCard('Loading previous sessions...')}
                </div>
                <button class="btn btn-secondary" onclick="App.showScreen('home')">Back to Home</button>
            </div>
        `;
    },

    // ============================================
    // SESSION DETAIL SCREEN
    // ============================================
    renderSessionDetail() {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2 id="sessionDetailTitle">Session Details</h2>
                <div id="sessionDetailMetadata"></div>
                <div id="sessionDetailContent">
                    ${Components.skeletonCard('Loading session details...')}
                </div>
                <div id="sessionDetailGraphs"></div>
                <button class="btn btn-secondary" onclick="App.showScreen('previousSessions')">Back to Sessions</button>
            </div>
        `;
    },

    // ============================================
    // STATS SCREEN
    // ============================================
    renderStats() {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2>📊 Statistics</h2>
                
                <div id="statsNav" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                    <button class="btn btn-small btn-info" onclick="App.showOverallStats()">Overall Stats</button>
                    <button class="btn btn-small btn-info" onclick="App.showHeadToHeadList()">Head-to-Head Records</button>
                    <button class="btn btn-small btn-info" onclick="App.showPlayerComparisonUI()">Detailed Comparison</button>
                </div>
                
                <div id="statsContent">
                    ${Components.skeletonCard('Loading statistics...')}
                </div>
                
                <button class="btn btn-secondary" onclick="App.showScreen('home')" style="margin-top: 20px;">Back to Home</button>
            </div>
        `;
    },

    // ============================================
    // DICTIONARY SCREEN
    // ============================================
    renderDictionary() {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2>📖 Dictionary</h2>
                
                <div id="dictionaryNav" style="display: flex; gap: 10px; margin-bottom: 20px; flex-wrap: wrap;">
                    <button class="btn btn-small btn-info" onclick="App.showDictionarySection('lingo')">🎭 Lockout Lingo</button>
                    <button class="btn btn-small btn-info" onclick="App.showDictionarySection('glossary')">📚 Glossary</button>
                </div>
                
                <div id="lingoSection" style="display: none;">
                    ${this.renderLingoContent()}
                </div>
                
                <div id="glossarySection" style="display: none;">
                    ${this.renderGlossaryContent()}
                </div>
                
                <button class="btn btn-secondary" onclick="App.showScreen('home')">Back to Home</button>
            </div>
        `;
    },

    renderLingoContent() {
        const lingoItems = [
            { name: '👔 Desmond (2-2)', desc: 'Desmond Tutu. When you turn over two 2s at the start.' },
            { name: '⚽ Sven (4-4 turned, then draw a 2)', desc: 'Sven-Göran Eriksson\'s 4-4-2 formation. Tactical genius.' },
            { name: '🇪🇺 The Brexit (5-2)', desc: '52% voted leave. Controversial hand.' },
            { name: '🤚 67 (6-7)', desc: 'Hand emoji vibes.' },
            { name: '😈 The Omen (6-6 turned, then 6)', desc: 'Three 6s. Biblically cursed. Probably going to false lockout.' },
            { name: '⛪ Pocket Peters / Pocket Ps (7-7)', desc: '7s → Heaven → St. Peter at the gates.' },
            { name: '🏛️ Caesar / A Wilde (8-8)', desc: 'Roman salute → HH → 88. Oscar Wilde also works.' },
            { name: '💼 Dolly (9-5)', desc: 'Dolly Parton\'s 9 to 5. Classic.' },
            { name: '🇩🇪 The German (9-9)', desc: '"Nein, nein!" Refusing that lockout.' },
            { name: '💋 Half Margot (10-10)', desc: 'Margot Robbie is all 10s... you\'ve got half of them. Four 10s would be a Full Margot.' },
            { name: '💅 Drag Race (Queen-Queen)', desc: 'Two queens. Sashay away if you false lockout.' },
            { name: '🌹 Diana / Lady Di (Queen-Jack)', desc: 'Queen and Jack together. The People\'s Princess.' },
            { name: '⚓ Nelson (1-1 turned, then 1)', desc: 'Three 1s. One eye, one arm, one... you get it. Cricket\'s cursed number.' },
            { name: '⚽ Pep (Red King-9)', desc: 'Fluid football. Guardiola\'s philosophy in card form.' },
            { name: '🤴 Charlie (Red King turned)', desc: 'Because of his fingers. RIP.' },
            { name: '🎺 National Anthem (Red King - Red King)', desc: 'Two red kings? Stand up and sing. House rules.' },
            { name: '🕵️ Bond (Red King - Red King turned, then 7)', desc: '0-0-7. Licensed to lockout.' }
        ];

        return `
            <div style="background: linear-gradient(135deg, #ff9800 0%, #ff5722 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 10px 0; font-size: 1.3em;">🎭 LOCKOUT LINGO</h3>
                <p style="margin: 0; font-size: 0.85em; font-style: italic;">
                    Nicknames with 3+ cards refer to the first two cards you turn at the start, then the next card drawn/revealed.
                </p>
            </div>
            <div style="max-height: 65vh; overflow-y: auto; padding-right: 10px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #667eea;">
                    ${lingoItems.map(item => `
                        <div style="background: white; padding: 10px; border-radius: 6px; margin-bottom: 8px;">
                            <p style="margin: 0;">
                                <strong style="color: #667eea;">${item.name}</strong><br>
                                <span style="font-size: 0.9em; color: #555;">${item.desc}</span>
                            </p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    renderGlossaryContent() {
        const gameTerms = [
            { term: 'Lockout', def: 'Declaring that you have 5 points or less at the start of your turn. If successful (strictly lowest score), you score 0 for the hand.' },
            { term: 'False Lockout', def: 'A failed lockout attempt where either your score is greater than 5, or you\'re tied/higher than another player. Results in your lockout score + penalty.' },
            { term: 'Lockout Score', def: 'The actual hand total you had when you declared lockout (e.g., 3 points). Recorded separately for statistics even if you score 0.' },
            { term: 'Hand', def: 'A single round of play, from deal to lockout reveal. Multiple hands make up a session.' },
            { term: 'Session', def: 'A complete game consisting of multiple hands. Ends when players decide (fixed hands, score target, or event end).' }
        ];

        const appTerms = [
            { term: 'Active Session', def: 'A session currently in progress (not yet ended). Can be resumed from the home screen.' },
            { term: 'Previous Sessions', def: 'Completed sessions that have been ended. Viewable with full stats and graphs.' },
            { term: 'Worm Chart (Cricket Worm)', def: 'A line graph showing cumulative scores over time for all players in a session.' },
            { term: 'Manhattan Chart', def: 'A bar chart showing hand-by-hand scores for all players in a session.' },
            { term: 'Head-to-Head Record', def: 'Direct win/loss record between two players when they compete in the same session (who finished with lower score).' }
        ];

        return `
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px; color: white;">
                <h3 style="margin: 0 0 10px 0; font-size: 1.3em;">📚 GLOSSARY OF TERMS</h3>
                <p style="margin: 0; font-size: 0.9em;">Game rules and app features explained</p>
            </div>
            <div style="max-height: 65vh; overflow-y: auto; padding-right: 10px;">
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #4caf50;">
                    <h3 style="color: #4caf50; margin-bottom: 15px;">🎴 Game Terms</h3>
                    ${gameTerms.map(item => `
                        <div style="background: white; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                            <h4 style="color: #667eea; margin: 0 0 5px 0; font-size: 1em;">${item.term}</h4>
                            <p style="margin: 0; font-size: 0.9em; color: #555;">${item.def}</p>
                        </div>
                    `).join('')}
                </div>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #9c27b0;">
                    <h3 style="color: #9c27b0; margin-bottom: 15px;">📱 App-Specific Terms</h3>
                    ${appTerms.map(item => `
                        <div style="background: white; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                            <h4 style="color: #667eea; margin: 0 0 5px 0; font-size: 1em;">${item.term}</h4>
                            <p style="margin: 0; font-size: 0.9em; color: #555;">${item.def}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    },

    // ============================================
    // INSTRUCTIONS SCREEN (abbreviated for space)
    // ============================================
    renderInstructions() {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2>📱 How to Use the Lockout Tracker</h2>
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px; color: white; text-align: center;">
                    <h3 style="margin: 0; font-size: 1.3em;">📊 OVERVIEW</h3>
                    <p style="margin: 10px 0 0 0; font-size: 0.95em;">
                        This app tracks your Lockout game sessions, records hand-by-hand scores, and generates detailed statistics. 
                        Players only input <strong>lockout scores</strong> and the app handles all calculations automatically.
                    </p>
                </div>
                <!-- Add full instructions content here -->
                <button class="btn btn-secondary" onclick="App.showScreen('home')" style="margin-top: 20px;">Back to Home</button>
            </div>
        `;
    },

    // ============================================
    // RULES SCREEN (abbreviated for space)
    // ============================================
    renderRules() {
        return `
            <div class="header">
                <h1>🎴 Lockout Tracker</h1>
            </div>
            <div class="card">
                <h2>📜 Lockout - Official Rules</h2>
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 10px; margin-bottom: 20px; color: white; text-align: center;">
                    <h3 style="margin: 0; font-size: 1.3em;">🎯 OBJECTIVE</h3>
                    <p style="margin: 10px 0 0 0; font-size: 0.95em;">
                        Be the player with the <strong>lowest cumulative score</strong> at the end of the session by winning hands through successful lockouts.
                    </p>
                </div>
                <!-- Add full rules content here -->
                <button class="btn btn-secondary" onclick="App.showScreen('home')" style="margin-top: 20px;">Back to Home</button>
            </div>
        `;
    }
};
