const API = {
    async call(action, params) {
        const url = new URL(CONFIG.API_URL);
        url.searchParams.append('action', action);
        for (let key in params) {
            url.searchParams.append(key, params[key]);
        }
        try {
            const response = await fetch(url);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('API Error:', error);
            return { error: error.message };
        }
    },

    getPlayers() {
        return this.call('getPlayers', {});
    },

    addPlayer(username, editorName) {
        return this.call('addPlayer', { username, editor_name: editorName });
    },

    createSession(params) {
        return this.call('createSession', params);
    },

    getSession(sessionId) {
        return this.call('getSession', { session_id: sessionId });
    },

    getSessions() {
        return this.call('getSessions', {});
    },

    getSessionsWithHands() {
        return this.call('getSessionsWithHands', {});
    },

    getHands(sessionId) {
        return this.call('getHands', { session_id: sessionId });
    },

    addHand(params) {
        return this.call('addHand', params);
    },

    updateHand(params) {
        return this.call('updateHand', params);
    },

    deleteHand(sessionId, handNumber, editorName) {
        return this.call('deleteHand', { 
            session_id: sessionId, 
            hand_number: handNumber, 
            editor_name: editorName 
        });
    },

    updateSession(params) {
        return this.call('updateSession', params);
    },

    closeSession(sessionId, editorName) {
        return this.call('closeSession', { 
            session_id: sessionId, 
            editor_name: editorName 
        });
    },

    addPlayerToSession(params) {
        return this.call('addPlayerToSession', params);
    },

    getHeadToHeadMatrix() {
        return this.call('getHeadToHeadMatrix', {});
    },

    getPlayerComparisonDetailed(player1Id, player2Id) {
        return this.call('getPlayerComparisonDetailed', { 
            player1_id: player1Id, 
            player2_id: player2Id 
        });
    }
};
