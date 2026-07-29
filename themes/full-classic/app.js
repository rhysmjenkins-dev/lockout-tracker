(function () {
    'use strict';

    const screens = Array.from(document.querySelectorAll('[data-screen]'));
    const desktopNav = Array.from(document.querySelectorAll('.primary-nav [data-go]'));
    const mobileNav = Array.from(document.querySelectorAll('.mobile-nav [data-go]'));
    const toast = document.getElementById('toast');
    let toastTimer = null;
    let pinValue = '';
    let pendingPlayer = 'Rhys';

    const playerFixtures = {
        Rhys: { initial: 'R', elo: '1020', bio: '“Regular host and scorekeeper.”', avatarClass: '' },
        Dave: { initial: 'D', elo: '1079', bio: '“Current ELO leader and regular at the table.”', avatarClass: 'avatar-dave' },
        Jack: { initial: 'J', elo: '1024', bio: '“Recent winner with an improving rating.”', avatarClass: 'avatar-jack' },
        Russ: { initial: 'R', elo: '932', bio: '“Joined the latest session from Hand 2.”', avatarClass: 'avatar-russ' },
        Jake: { initial: 'J', elo: '971', bio: '“Eleven sessions and seventy-two official hands.”', avatarClass: 'avatar-jake' },
        Dan: { initial: 'D', elo: '1000?', bio: '“A provisional player finding his level.”', avatarClass: 'avatar-dan' },
        Lewis: { initial: 'L', elo: '986?', bio: '“A provisional player with three sessions recorded.”', avatarClass: 'avatar-lewis' },
        Joe: { initial: 'J', elo: '1008?', bio: '“New to the official table.”', avatarClass: 'avatar-joe' }
    };

    const chartFixtures = {
        sessionChart: {
            labels: ['H1', 'H2', 'H3', 'H4', 'H5'],
            series: [
                { name: 'Jack', color: '#5964d7', data: [-1, -1, 0, 0, -1] },
                { name: 'Russ (H2)', color: '#f05a72', data: [null, 7, 6, 7, 8] },
                { name: 'Dave', color: '#4aa4e8', data: [0, 5, 6, 10, 10] },
                { name: 'Jake', color: '#10bdc6', data: [2, 7, 7, 11, 16] }
            ],
            hands: [
                { name: 'Jack', color: '#5964d7', data: [-1, 0, 1, 0, -1] },
                { name: 'Russ (H2)', color: '#f05a72', data: [null, 6, -1, 1, 1] },
                { name: 'Dave', color: '#4aa4e8', data: [0, 5, 1, 4, 0] },
                { name: 'Jake', color: '#10bdc6', data: [2, 5, 0, 4, 5] }
            ]
        },
        activeChart: {
            labels: ['H1', 'H2', 'H3'],
            series: [
                { name: 'Dave', color: '#4aa4e8', data: [0, 0, -1] },
                { name: 'Rhys', color: '#8b62c8', data: [1, 1, 4] },
                { name: 'Jack', color: '#5964d7', data: [2, 5, 9] }
            ],
            hands: [
                { name: 'Dave', color: '#4aa4e8', data: [0, 0, -1] },
                { name: 'Rhys', color: '#8b62c8', data: [1, 0, 3] },
                { name: 'Jack', color: '#5964d7', data: [2, 3, 4] }
            ]
        },
        profileChart: {
            labels: ['S15', 'S16', 'S17', 'S18', 'S19', 'S20', 'S21', 'S22'],
            series: [{ name: 'ELO', color: '#5964d7', data: [990, 1007, 1013, 1005, 1012, 1006, 1024, 1020] }]
        }
    };

    const chartTypes = { sessionChart: 'line', activeChart: 'line', profileChart: 'line' };

    function mappedNav(screenName) {
        if (screenName === 'profile') return 'players';
        if (screenName === 'session-detail') return 'previous-sessions';
        if (screenName === 'active-session') return 'start-session';
        if (['how-to', 'dictionary', 'rules', 'add-player'].includes(screenName)) return 'more';
        return screenName;
    }

    function showScreen(screenName, updateHistory) {
        const target = document.querySelector('[data-screen="' + screenName + '"]');
        if (!target) return;

        screens.forEach(function (screen) {
            const active = screen === target;
            screen.hidden = !active;
            screen.classList.toggle('is-active', active);
        });

        const navName = mappedNav(screenName);
        desktopNav.concat(mobileNav).forEach(function (button) {
            button.classList.toggle('is-active', button.dataset.go === navName);
        });

        if (updateHistory !== false) {
            history.pushState({ screen: screenName }, '', '#' + screenName);
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        requestAnimationFrame(drawVisibleCharts);
    }

    function showToast(message) {
        clearTimeout(toastTimer);
        toast.textContent = message;
        toast.hidden = false;
        toastTimer = setTimeout(function () {
            toast.hidden = true;
        }, 3200);
    }

    function openModal(name) {
        const modal = name === 'sign-in'
            ? document.getElementById('signInModal')
            : name === 'edit-profile'
                ? document.getElementById('editProfileModal')
                : document.getElementById('demoModal');
        if (!modal) return;
        modal.hidden = false;
        document.body.style.overflow = 'hidden';
        const focusTarget = modal.querySelector('input:not([disabled]), button');
        if (focusTarget) setTimeout(function () { focusTarget.focus(); }, 20);
    }

    function closeModal(modal) {
        const target = modal && modal.classList && modal.classList.contains('modal')
            ? modal
            : document.querySelector('.modal:not([hidden])');
        if (target) target.hidden = true;
        if (!document.querySelector('.modal:not([hidden])')) document.body.style.overflow = '';
    }

    function openDemo(action, copy) {
        const title = document.getElementById('demoModalTitle');
        const body = document.getElementById('demoModalCopy');
        title.textContent = action || 'Preview only';
        body.textContent = copy || 'This control is represented visually. No live data was changed.';
        openModal('demo');
    }

    function selectStatsTab(name) {
        document.querySelectorAll('[data-stats-tab]').forEach(function (button) {
            button.classList.toggle('is-active', button.dataset.statsTab === name);
        });
        document.querySelectorAll('[data-stats-view]').forEach(function (view) {
            const active = view.dataset.statsView === name;
            view.hidden = !active;
            view.classList.toggle('is-active', active);
        });
        requestAnimationFrame(drawVisibleCharts);
    }

    function selectDictionaryTab(name) {
        document.querySelectorAll('[data-dictionary-tab]').forEach(function (button) {
            button.classList.toggle('is-active', button.dataset.dictionaryTab === name);
        });
        document.querySelectorAll('[data-dictionary-view]').forEach(function (view) {
            const active = view.dataset.dictionaryView === name;
            view.hidden = !active;
            view.classList.toggle('is-active', active);
        });
    }

    function loadProfile(name) {
        const fixture = playerFixtures[name] || playerFixtures.Rhys;
        document.getElementById('profileTitle').textContent = name;
        document.getElementById('profileElo').textContent = '⚡ ' + fixture.elo;
        document.getElementById('profileBio').textContent = fixture.bio;
        const avatar = document.getElementById('profileAvatar');
        avatar.textContent = fixture.initial;
        avatar.className = 'avatar avatar-profile ' + fixture.avatarClass;
        showScreen('profile');
    }

    function loadSession(title) {
        document.getElementById('sessionDetailTitle').textContent = title || '280726 Lunch';
        showScreen('session-detail');
    }

    function applyFilter(input) {
        const name = input.dataset.filterInput;
        const list = document.querySelector('[data-filter-list="' + name + '"]');
        if (!list) return;
        const value = input.value.trim().toLowerCase();
        const activeChip = document.querySelector('[data-filter-chips="' + name + '"] .is-active');
        const kind = activeChip ? activeChip.dataset.filterValue : 'all';
        list.querySelectorAll('[data-search]').forEach(function (item) {
            const matchesText = (item.dataset.search || '').toLowerCase().includes(value);
            const matchesKind = kind === 'all' || item.dataset.kind === kind;
            item.hidden = !(matchesText && matchesKind);
        });
    }

    function applyArchiveKind(button) {
        const group = button.closest('[data-filter-chips]');
        group.querySelectorAll('button').forEach(function (item) {
            item.classList.toggle('is-active', item === button);
        });
        const input = document.querySelector('[data-filter-input="' + group.dataset.filterChips + '"]');
        if (input) applyFilter(input);
    }

    function resetPin() {
        pinValue = '';
        updatePinDots();
    }

    function updatePinDots() {
        document.querySelectorAll('.pin-dots i').forEach(function (dot, index) {
            dot.classList.toggle('is-filled', index < pinValue.length);
        });
    }

    function chooseSignInPlayer(name) {
        pendingPlayer = name;
        const fixture = playerFixtures[name] || playerFixtures.Rhys;
        const playerStep = document.querySelector('[data-signin-step="player"]');
        const pinStep = document.querySelector('[data-signin-step="pin"]');
        playerStep.hidden = true;
        playerStep.classList.remove('is-active');
        pinStep.hidden = false;
        pinStep.classList.add('is-active');
        document.getElementById('pinPlayerName').textContent = name;
        const avatar = document.getElementById('pinAvatar');
        avatar.textContent = fixture.initial;
        avatar.className = 'avatar avatar-lg ' + fixture.avatarClass;
        resetPin();
    }

    function showPlayerStep() {
        document.querySelector('[data-signin-step="player"]').hidden = false;
        document.querySelector('[data-signin-step="pin"]').hidden = true;
        resetPin();
    }

    function enterPin(digit) {
        if (pinValue.length >= 4) return;
        pinValue += digit;
        updatePinDots();
        if (pinValue.length === 4) {
            setTimeout(function () {
                document.getElementById('identityName').textContent = pendingPlayer;
                closeModal(document.getElementById('signInModal'));
                showPlayerStep();
                showToast('Playing as ' + pendingPlayer + ' · prototype only');
            }, 280);
        }
    }

    function comparePlayers(a, b) {
        showScreen('stats');
        selectStatsTab('comparison');
        const selectA = document.getElementById('compareA');
        const selectB = document.getElementById('compareB');
        if (selectA && Array.from(selectA.options).some(function (o) { return o.value === a; })) selectA.value = a;
        if (selectB && Array.from(selectB.options).some(function (o) { return o.value === b; })) selectB.value = b;
        updateComparison();
    }

    function updateComparison() {
        const a = document.getElementById('compareA').value;
        const b = document.getElementById('compareB').value;
        const fixtureA = playerFixtures[a] || playerFixtures.Rhys;
        const fixtureB = playerFixtures[b] || playerFixtures.Dave;
        const result = document.getElementById('comparisonResult');
        const people = result.querySelectorAll('.comparison-person');
        [
            [people[0], a, fixtureA],
            [people[1], b, fixtureB]
        ].forEach(function (entry) {
            const person = entry[0];
            const name = entry[1];
            const fixture = entry[2];
            const avatar = person.querySelector('.avatar');
            avatar.textContent = fixture.initial;
            avatar.className = 'avatar avatar-lg ' + fixture.avatarClass;
            person.querySelector('strong').textContent = name;
            person.querySelector('small').textContent = '⚡ ' + fixture.elo;
        });
        showToast('Comparison updated using fixture data');
    }

    function sortPlayers(value) {
        const grid = document.querySelector('[data-filter-list="playerGrid"]');
        const cards = Array.from(grid.children);
        cards.sort(function (a, b) {
            if (value === 'name') return a.dataset.search.localeCompare(b.dataset.search);
            return Number(b.dataset[value]) - Number(a.dataset[value]);
        });
        cards.forEach(function (card) { grid.appendChild(card); });
    }

    function drawVisibleCharts() {
        Object.keys(chartFixtures).forEach(function (id) {
            const canvas = document.getElementById(id);
            if (canvas && canvas.offsetParent !== null) drawChart(canvas, chartTypes[id] || 'line');
        });
    }

    function drawChart(canvas, type) {
        const fixture = chartFixtures[canvas.id];
        if (!fixture) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width < 10 || rect.height < 10) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(rect.height * ratio);
        const ctx = canvas.getContext('2d');
        ctx.scale(ratio, ratio);
        const width = rect.width;
        const height = rect.height;
        const pad = { top: 18, right: 14, bottom: 35, left: 40 };
        const plotW = width - pad.left - pad.right;
        const plotH = height - pad.top - pad.bottom;
        const source = type === 'bar' ? fixture.hands || fixture.series : fixture.series;
        const values = source.flatMap(function (series) {
            return series.data.filter(function (value) { return value !== null && Number.isFinite(value); });
        });
        let min = Math.min.apply(null, values);
        let max = Math.max.apply(null, values);
        if (min === max) { min -= 1; max += 1; }
        const padding = Math.max(1, (max - min) * .12);
        min = Math.floor(min - padding);
        max = Math.ceil(max + padding);
        const range = max - min || 1;
        const xAt = function (index) {
            return pad.left + (fixture.labels.length === 1 ? plotW / 2 : (plotW * index / (fixture.labels.length - 1)));
        };
        const yAt = function (value) {
            return pad.top + (max - value) / range * plotH;
        };

        ctx.clearRect(0, 0, width, height);
        ctx.font = '11px Inter, system-ui, sans-serif';
        ctx.lineWidth = 1;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const gridCount = 5;
        for (let i = 0; i <= gridCount; i += 1) {
            const value = max - range * i / gridCount;
            const y = yAt(value);
            ctx.beginPath();
            ctx.strokeStyle = '#e5e7ef';
            ctx.moveTo(pad.left, y);
            ctx.lineTo(width - pad.right, y);
            ctx.stroke();
            ctx.fillStyle = '#7b8191';
            ctx.fillText(String(Math.round(value * 10) / 10), pad.left - 7, y);
        }
        if (min < 0 && max > 0) {
            ctx.beginPath();
            ctx.strokeStyle = '#9ea4b7';
            ctx.lineWidth = 1.3;
            ctx.moveTo(pad.left, yAt(0));
            ctx.lineTo(width - pad.right, yAt(0));
            ctx.stroke();
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        fixture.labels.forEach(function (label, index) {
            ctx.fillStyle = '#747a8c';
            ctx.fillText(label, xAt(index), height - pad.bottom + 11);
        });

        if (type === 'bar') {
            const groups = fixture.labels.length;
            const groupWidth = plotW / Math.max(groups, 1);
            const barGap = 2;
            const barWidth = Math.max(3, Math.min(18, (groupWidth - 10) / source.length - barGap));
            source.forEach(function (series, seriesIndex) {
                series.data.forEach(function (value, index) {
                    if (value === null) return;
                    const groupCenter = pad.left + groupWidth * (index + .5);
                    const totalWidth = source.length * (barWidth + barGap) - barGap;
                    const x = groupCenter - totalWidth / 2 + seriesIndex * (barWidth + barGap);
                    const zeroY = yAt(0);
                    const valueY = yAt(value);
                    ctx.fillStyle = series.color;
                    ctx.globalAlpha = .86;
                    ctx.fillRect(x, Math.min(zeroY, valueY), barWidth, Math.max(2, Math.abs(zeroY - valueY)));
                    ctx.globalAlpha = 1;
                });
            });
        } else {
            source.forEach(function (series) {
                ctx.beginPath();
                ctx.lineWidth = 2.2;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.strokeStyle = series.color;
                let started = false;
                series.data.forEach(function (value, index) {
                    if (value === null) { started = false; return; }
                    const x = xAt(index);
                    const y = yAt(value);
                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                });
                ctx.stroke();
                series.data.forEach(function (value, index) {
                    if (value === null) return;
                    ctx.beginPath();
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = series.color;
                    ctx.lineWidth = 2;
                    ctx.arc(xAt(index), yAt(value), 3.2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                });
            });
        }
    }

    document.addEventListener('click', function (event) {
        const go = event.target.closest('[data-go]');
        if (go) {
            event.preventDefault();
            showScreen(go.dataset.go);
            if (go.dataset.statsTarget) selectStatsTab(go.dataset.statsTarget);
            if (go.dataset.scrollTarget) {
                setTimeout(function () {
                    const target = document.getElementById(go.dataset.scrollTarget);
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 80);
            }
            return;
        }

        const player = event.target.closest('[data-player]');
        if (player) {
            loadProfile(player.dataset.player);
            return;
        }

        const session = event.target.closest('[data-session]');
        if (session) {
            loadSession(session.dataset.session);
            return;
        }

        const compare = event.target.closest('[data-compare]');
        if (compare) {
            const names = compare.dataset.compare.split(',');
            comparePlayers(names[0], names[1]);
            return;
        }

        const modalButton = event.target.closest('[data-modal]');
        if (modalButton) {
            if (modalButton.dataset.modal === 'sign-in') showPlayerStep();
            openModal(modalButton.dataset.modal);
            return;
        }

        if (event.target.closest('[data-close-modal]')) {
            closeModal(event.target.closest('.modal'));
            return;
        }

        const demoAction = event.target.closest('[data-demo-action]');
        if (demoAction) {
            openDemo(demoAction.dataset.demoAction);
            return;
        }

        const statsTab = event.target.closest('[data-stats-tab]');
        if (statsTab) {
            selectStatsTab(statsTab.dataset.statsTab);
            return;
        }

        const dictionaryTab = event.target.closest('[data-dictionary-tab]');
        if (dictionaryTab) {
            selectDictionaryTab(dictionaryTab.dataset.dictionaryTab);
            return;
        }

        const archiveChip = event.target.closest('[data-filter-chips] button');
        if (archiveChip) {
            applyArchiveKind(archiveChip);
            return;
        }

        const chartTab = event.target.closest('[data-chart-type]');
        if (chartTab) {
            const group = chartTab.closest('[data-chart-tabs]');
            group.querySelectorAll('button').forEach(function (button) {
                button.classList.toggle('is-active', button === chartTab);
            });
            const chartId = group.dataset.chartTabs;
            chartTypes[chartId] = chartTab.dataset.chartType;
            drawChart(document.getElementById(chartId), chartTypes[chartId]);
            return;
        }

        const signInPlayer = event.target.closest('[data-signin-player]');
        if (signInPlayer) {
            chooseSignInPlayer(signInPlayer.dataset.signinPlayer);
            return;
        }

        if (event.target.closest('[data-signin-back]')) {
            showPlayerStep();
            return;
        }

        const pin = event.target.closest('[data-pin]');
        if (pin) {
            enterPin(pin.dataset.pin);
            return;
        }

        if (event.target.closest('[data-pin-delete]')) {
            pinValue = pinValue.slice(0, -1);
            updatePinDots();
            return;
        }

        const achievement = event.target.closest('[data-achievement]');
        if (achievement) {
            const parts = achievement.dataset.achievement.split(' · ');
            openDemo(parts[0], parts.slice(1).join(' · ') + '. No live profile data is used in this prototype.');
            return;
        }

        const audioToggle = event.target.closest('[data-audio-toggle]');
        if (audioToggle) {
            const card = audioToggle.closest('.featured-podcast');
            const play = card.querySelector('.podcast-play');
            const player = card.querySelector('.fake-audio');
            const showPlayer = player.hidden;
            player.hidden = !showPlayer;
            play.hidden = showPlayer;
            if (!showPlayer) showToast('Playback paused · fixture player');
            return;
        }
    });

    document.addEventListener('input', function (event) {
        if (event.target.matches('[data-filter-input]')) applyFilter(event.target);
        if (event.target.id === 'newPlayerName') {
            const preview = document.querySelector('.onboarding-preview .avatar');
            preview.textContent = event.target.value.trim().charAt(0).toUpperCase() || 'N';
        }
    });

    document.addEventListener('change', function (event) {
        if (event.target.matches('[data-sort-players]')) sortPlayers(event.target.value);
    });

    document.addEventListener('submit', function (event) {
        const form = event.target.closest('[data-demo-form]');
        if (!form) return;
        event.preventDefault();
        const type = form.dataset.demoForm;
        if (type === 'start-session') {
            showToast('Session checked · opening the fixture scoring screen');
            setTimeout(function () { showScreen('active-session'); }, 450);
        } else if (type === 'hand') {
            showToast('Hand validated · prototype only, nothing was saved');
        } else if (type === 'add-player') {
            openDemo('Add player', 'The live app would now create the player and continue to PIN or profile setup. Nothing was saved here.');
        } else if (type === 'profile') {
            closeModal(form.closest('.modal'));
            showToast('Profile preview complete · nothing was saved');
        }
    });

    document.getElementById('compareButton').addEventListener('click', updateComparison);

    window.addEventListener('popstate', function () {
        const name = location.hash.replace(/^#/, '') || 'home';
        showScreen(document.querySelector('[data-screen="' + name + '"]') ? name : 'home', false);
    });

    window.addEventListener('resize', function () {
        window.clearTimeout(window.__lockoutChartResize);
        window.__lockoutChartResize = window.setTimeout(drawVisibleCharts, 100);
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeModal();
    });

    const initialScreen = location.hash.replace(/^#/, '') || 'home';
    showScreen(document.querySelector('[data-screen="' + initialScreen + '"]') ? initialScreen : 'home', false);
    selectDictionaryTab('lingo');
})();
