const Components = {
    // Skeleton Loaders
    skeletonCard(title) {
        return `
            <div class="skeleton-card">
                <h3 style="color: #667eea; margin-bottom: 20px;">${title}</h3>
                <div style="overflow-x: auto;">
                    ${this.skeletonTableRows(3)}
                </div>
            </div>
        `;
    },

    skeletonTableRows(count) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="skeleton-table-row">
                    <div class="shimmer-wrapper skeleton-table-cell"></div>
                    <div class="shimmer-wrapper skeleton-table-cell"></div>
                    <div class="shimmer-wrapper skeleton-table-cell"></div>
                </div>
            `;
        }
        return html;
    },

    skeletonSessionItems(count) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `
                <div class="skeleton-session-item">
                    <div class="shimmer-wrapper skeleton-text" style="width: 70%; margin-bottom: 8px;"></div>
                    <div class="shimmer-wrapper skeleton-text small" style="width: 50%;"></div>
                </div>
            `;
        }
        return html;
    },

    // Tag Badges
    tagBadges(tagsString) {
        if (!tagsString) return '';
        const tags = tagsString.split(',').filter(t => t.trim());
        return tags.map(tag => `<span class="tag-badge">${tag}</span>`).join('');
    },

    // Late Join Badge
    lateJoinBadge(joinHand) {
        return joinHand > 1 ? `<span class="late-join-badge">Joined H${joinHand}</span>` : '';
    },

    // Player Selection List
    playerCheckboxList(players) {
        return `
            <ul class="player-list">
                ${players.map(p => `
                    <li class="player-item">
                        <label>
                            <input type="checkbox" value="${p.player_id}" class="player-checkbox">
                            ${p.username}
                        </label>
                    </li>
                `).join('')}
            </ul>
        `;
    },

    // Session Tags Dropdown
    sessionTagsDropdown(selectedTags = []) {
        return `
            <select id="sessionTags" multiple size="4" style="min-height: 120px;">
                ${CONFIG.SESSION_TAGS.map(tag => `
                    <option value="${tag.value}" ${selectedTags.includes(tag.value) ? 'selected' : ''}>
                        ${tag.label}
                    </option>
                `).join('')}
            </select>
            <small style="color: #666; display: block; margin-top: 5px;">
                Hold Ctrl (Cmd on Mac) to select multiple
            </small>
        `;
    },

    // Scores Table
    scoresTable(tableId, headers, rows, sortable = true) {
        const sortAttr = sortable ? `onclick="sortTable('${tableId}', {index})"` : '';
        const sortIndicator = sortable ? ' ⇅' : '';
        
        return `
            <p style="color: #666; font-size: 0.9em; margin-bottom: 10px;">
                ${sortable ? '💡 Click column headers to sort' : ''}
            </p>
            <div style="overflow-x: auto;">
                <table class="scores-table" id="${tableId}">
                    <tr>
                        ${headers.map((h, i) => `
                            <th ${sortAttr.replace('{index}', i)} 
                                style="${sortable ? 'cursor: pointer; user-select: none;' : ''}">
                                ${h}${sortIndicator}
                            </th>
                        `).join('')}
                    </tr>
                    ${rows.map(row => `
                        <tr>
                            ${row.map(cell => `<td>${cell}</td>`).join('')}
                        </tr>
                    `).join('')}
                </table>
            </div>
        `;
    }
};
