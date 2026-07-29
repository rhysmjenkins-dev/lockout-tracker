(() => {
  'use strict';

  const pageMeta = {
    home: ['Tonight’s table', 'Home'],
    start: ['New game', 'Start session'],
    active: ['Live now', 'Active session'],
    players: ['The group', 'Players'],
    profile: ['Player record', 'Profile'],
    history: ['Game archive', 'Previous sessions'],
    'session-detail': ['Completed game', 'Session detail'],
    stats: ['Official records', 'Statistics'],
    podcast: ['From around the table', 'Podcasts'],
    'add-player': ['New profile', 'Add player'],
    howto: ['App guide', 'How to use'],
    dictionary: ['Words from the table', 'Dictionary'],
    rules: ['Official group rules', 'Rules']
  };

  const profiles = {
    Dave: { initials: 'DA', avatar: 'avatar-dave', bio: 'Current ELO leader and a regular player.', elo: '1069', status: 'Established player' },
    Jack: { initials: 'JK', avatar: 'avatar-jack', bio: 'Current lunch champion and steady scorer.', elo: '1024?', status: 'Provisional player' },
    Rhys: { initials: 'RJ', avatar: 'avatar-rhys', bio: 'Regular host and scorekeeper.', elo: '1000?', status: 'Provisional player' },
    Jake: { initials: 'JA', avatar: 'avatar-jake', bio: 'A regular player with seven sessions recorded.', elo: '971?', status: 'Provisional player' },
    Russ: { initials: 'RU', avatar: 'avatar-russ', bio: 'Joined the latest session from Hand 2.', elo: '932?', status: 'Provisional player' }
  };

  const pages = [...document.querySelectorAll('[data-page]')];
  const routeButtons = [...document.querySelectorAll('[data-route]')];
  const navButtons = [...document.querySelectorAll('.nav-item[data-route], .mobile-nav [data-route]')];
  let currentRoute = 'home';
  let currentModal = null;
  let modalReturnFocus = null;
  let pinValue = '';
  let chartFrame = 0;

  function safeRoute(route) {
    return pageMeta[route] ? route : 'home';
  }

  function showRoute(route, options = {}) {
    route = safeRoute(route);
    currentRoute = route;
    pages.forEach(page => page.classList.toggle('active', page.dataset.page === route));
    navButtons.forEach(button => {
      const buttonRoute = button.dataset.route;
      const active = buttonRoute === route || (route === 'profile' && buttonRoute === 'players') ||
        (route === 'session-detail' && buttonRoute === 'history');
      button.classList.toggle('active', active);
    });
    const [eyebrow, context] = pageMeta[route];
    document.getElementById('pageEyebrow').textContent = eyebrow;
    document.getElementById('pageContext').textContent = context;
    document.title = `${context} — Lockout Tracker`;
    closeDrawer();
    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: 'instant' });
    if (location.hash !== `#${route}`) history.replaceState(null, '', `#${route}`);
    requestChartDraw();
    if (options.focus !== false) {
      const main = document.getElementById('mainContent');
      main.focus({ preventScroll: true });
    }
  }

  routeButtons.forEach(button => {
    button.addEventListener('click', event => {
      const player = event.currentTarget.dataset.player;
      if (player) updateProfile(player);
      const tab = event.currentTarget.dataset.statsTab;
      showRoute(event.currentTarget.dataset.route);
      if (tab) showStatsTab(tab);
    });
  });

  window.addEventListener('hashchange', () => showRoute(location.hash.slice(1), { focus: false }));

  function updateProfile(name) {
    const profile = profiles[name] || profiles.Dave;
    const avatar = document.getElementById('profileAvatar');
    avatar.className = `avatar ${profile.avatar} profile-avatar`;
    avatar.textContent = profile.initials;
    document.getElementById('profileTitle').textContent = name;
    document.getElementById('profileBio').textContent = profile.bio;
    document.getElementById('profileElo').textContent = profile.elo;
    document.querySelector('[data-page="profile"] .kicker').lastChild.textContent = ` ${profile.status}`;
    document.getElementById('profileBioInput').value = profile.bio;
  }

  function showStatsTab(tab) {
    const valid = ['overall', 'h2h', 'comparison', 'elo'].includes(tab) ? tab : 'overall';
    document.querySelectorAll('.stats-tabs [data-tab]').forEach(button => button.classList.toggle('active', button.dataset.tab === valid));
    document.querySelectorAll('[data-tab-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.tabPanel === valid));
    requestChartDraw();
  }

  document.querySelectorAll('.stats-tabs [data-tab]').forEach(button => {
    button.addEventListener('click', () => showStatsTab(button.dataset.tab));
  });

  document.getElementById('compareProfile').addEventListener('click', () => {
    showRoute('stats');
    showStatsTab('comparison');
  });

  function showDictionaryTab(tab) {
    const valid = tab === 'glossary' ? 'glossary' : 'lingo';
    document.querySelectorAll('[data-dictionary-tab]').forEach(button => button.classList.toggle('active', button.dataset.dictionaryTab === valid));
    document.querySelectorAll('[data-dictionary-panel]').forEach(panel => panel.classList.toggle('active', panel.dataset.dictionaryPanel === valid));
  }

  document.querySelectorAll('[data-dictionary-tab]').forEach(button => {
    button.addEventListener('click', () => showDictionaryTab(button.dataset.dictionaryTab));
  });

  function bindSearch(inputId, selector, attribute = 'data-search') {
    const input = document.getElementById(inputId);
    if (!input) return;
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      document.querySelectorAll(selector).forEach(item => {
        const value = (item.getAttribute(attribute) || item.textContent).toLowerCase();
        item.hidden = !value.includes(query);
      });
    });
  }

  bindSearch('sessionPlayerSearch', '#sessionPlayerList > label');
  bindSearch('playerSearch', '#playerGrid > .player-card', 'data-player');
  bindSearch('sessionSearch', '#sessionList > .session-row');
  bindSearch('glossarySearch', '#glossaryGrid > article');

  document.getElementById('playerSort').addEventListener('change', event => {
    const grid = document.getElementById('playerGrid');
    const cards = [...grid.children];
    const key = event.target.value;
    cards.sort((a, b) => {
      if (key === 'name') return a.dataset.player.localeCompare(b.dataset.player);
      return Number(b.dataset[key]) - Number(a.dataset[key]);
    });
    cards.forEach(card => grid.appendChild(card));
  });

  document.querySelectorAll('#historyFilters [data-filter]').forEach(button => {
    button.addEventListener('click', () => {
      document.querySelectorAll('#historyFilters [data-filter]').forEach(item => item.classList.toggle('active', item === button));
      const filter = button.dataset.filter;
      document.querySelectorAll('#sessionList .session-row').forEach(row => {
        row.hidden = filter !== 'all' && row.dataset.tags !== filter;
      });
    });
  });

  function openModal(id, trigger = document.activeElement) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (currentModal) closeModal(false);
    modalReturnFocus = trigger;
    modal.hidden = false;
    currentModal = modal;
    document.body.style.overflow = 'hidden';
    const focusable = modal.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    if (focusable) requestAnimationFrame(() => focusable.focus());
  }

  function closeModal(restoreFocus = true) {
    if (!currentModal) return;
    currentModal.hidden = true;
    currentModal = null;
    document.body.style.overflow = '';
    pinValue = '';
    updatePinDots();
    if (restoreFocus && modalReturnFocus && typeof modalReturnFocus.focus === 'function') modalReturnFocus.focus();
  }

  document.querySelectorAll('[data-modal]').forEach(button => button.addEventListener('click', () => openModal(button.dataset.modal, button)));
  document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal()));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (currentModal) closeModal();
      else closeDrawer();
    }
    if (event.key === 'Tab' && currentModal) trapFocus(event, currentModal);
  });

  function trapFocus(event, container) {
    const focusable = [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]')];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.getElementById('identityButton').addEventListener('click', event => openModal('signInModal', event.currentTarget));
  document.getElementById('continueSignIn').addEventListener('click', () => {
    const name = document.getElementById('signInPlayer').value;
    closeModal(false);
    document.getElementById('pinPlayerName').textContent = name;
    openModal('pinModal');
  });

  function updatePinDots() {
    document.querySelectorAll('.pin-dots').forEach(group => {
      [...group.children].forEach((dot, index) => dot.classList.toggle('filled', index < pinValue.length));
    });
  }

  document.querySelectorAll('.pin-pad, .setup-pad').forEach(pad => {
    pad.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.hasAttribute('data-pin-clear')) pinValue = pinValue.slice(0, -1);
      else if (button.hasAttribute('data-pin-submit')) {
        if (pinValue.length < 4) return showToast('Enter all four digits first.');
        closeModal(false);
        showToast('Signed in. Playing as Rhys.', 'success');
        return;
      } else if (/^\d$/.test(button.textContent.trim()) && pinValue.length < 4) {
        pinValue += button.textContent.trim();
      }
      updatePinDots();
    });
  });

  document.getElementById('startSessionForm').addEventListener('submit', event => {
    event.preventDefault();
    showRoute('active');
    showToast('Prototype session created. No data was saved.', 'success');
  });

  document.getElementById('addPlayerForm').addEventListener('submit', event => {
    event.preventDefault();
    const self = event.currentTarget.querySelector('[name="ownership"]:checked').value === 'self';
    if (self) openModal('pinSetupModal', event.currentTarget.querySelector('[type=submit]'));
    else {
      showRoute('players');
      showToast('Player added to the prototype.', 'success');
    }
  });

  document.getElementById('profileEditForm').addEventListener('submit', event => {
    event.preventDefault();
    const bio = document.getElementById('profileBioInput').value.trim();
    document.getElementById('profileBio').textContent = bio || 'No bio added yet.';
    closeModal(false);
    showToast('Profile preview updated.', 'success');
  });

  document.querySelectorAll('.simple-save-form').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      closeModal(false);
      showToast('Prototype change applied.', 'success');
    });
  });

  document.getElementById('handForm').addEventListener('submit', event => {
    event.preventDefault();
    const number = document.getElementById('activeHandNumber');
    number.textContent = Number(number.textContent) + 1;
    showToast('Hand saved in the prototype.', 'success');
  });

  document.getElementById('toggleActiveHistory').addEventListener('click', event => {
    const history = document.getElementById('activeHistory');
    history.hidden = !history.hidden;
    event.currentTarget.textContent = history.hidden ? 'Expand' : 'Collapse';
  });

  document.getElementById('confirmEndSession').addEventListener('click', () => {
    closeModal(false);
    showRoute('history');
    showToast('Session ended in the prototype.', 'success');
  });

  document.getElementById('copyLink').addEventListener('click', event => {
    const input = event.currentTarget.previousElementSibling;
    if (navigator.clipboard) navigator.clipboard.writeText(input.value).catch(() => {});
    input.select();
    showToast('Session link copied.', 'success');
  });

  document.getElementById('openFeedback').addEventListener('click', event => openModal('feedbackModal', event.currentTarget));

  function showToast(message, type = '') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`.trim();
    toast.textContent = message;
    document.querySelector('.toast-region').appendChild(toast);
    window.setTimeout(() => toast.remove(), 2800);
  }

  const moreDrawer = document.getElementById('moreDrawer');
  document.getElementById('mobileMore').addEventListener('click', () => {
    moreDrawer.hidden = false;
    document.body.style.overflow = 'hidden';
  });
  document.querySelectorAll('[data-close-drawer]').forEach(button => button.addEventListener('click', closeDrawer));
  function closeDrawer() {
    moreDrawer.hidden = true;
    if (!currentModal) document.body.style.overflow = '';
  }

  const audioDock = document.getElementById('audioDock');
  let audioPlaying = false;
  function setAudioPlaying(playing) {
    audioPlaying = playing;
    audioDock.hidden = false;
    document.getElementById('dockPlay').textContent = playing ? '❚❚' : '▶';
    document.querySelectorAll('.episode-play').forEach(button => button.textContent = playing ? '❚❚' : '▶');
  }
  document.getElementById('playLatest').addEventListener('click', () => setAudioPlaying(true));
  document.querySelectorAll('.episode-play').forEach(button => button.addEventListener('click', () => setAudioPlaying(!audioPlaying)));
  document.getElementById('dockPlay').addEventListener('click', () => setAudioPlaying(!audioPlaying));
  document.getElementById('closeAudio').addEventListener('click', () => {
    audioPlaying = false;
    audioDock.hidden = true;
  });

  const chartDefinitions = {
    profileChart: {
      labels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7'],
      lines: [{ color: '#8f82f8', values: [1000, 1012, 1005, 1028, 1041, 1076, 1069] }],
      min: 960, max: 1090
    },
    wormChart: {
      labels: ['H1', 'H2', 'H3', 'H4', 'H5'],
      lines: [
        { color: '#8f82f8', values: [-1, 0, 1, 0, -1] },
        { color: '#ef6b7b', values: [null, 6, 5, 6, 8] },
        { color: '#61a8ff', values: [0, 5, 6, 10, 10] },
        { color: '#3fcbbb', values: [2, 7, 7, 11, 16] }
      ],
      min: -2, max: 17
    },
    eloChart: {
      labels: ['S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8'],
      lines: [
        { color: '#61a8ff', values: [1000, 1012, 1025, 1018, 1044, 1056, 1076, 1069] },
        { color: '#8f82f8', values: [1000, 1000, 1008, 1004, 1024, 1024, 1004, 1024] },
        { color: '#f0bd63', values: [1000, 1010, 995, 1011, 1000, 1000, 1000, 1000] },
        { color: '#ef6b7b', values: [1000, 980, 965, 948, 925, 932, 925, 932] }
      ],
      min: 900, max: 1100
    }
  };

  const barDefinition = {
    labels: ['H1', 'H2', 'H3', 'H4', 'H5'],
    series: [
      { color: '#8f82f8', values: [-1, 1, 1, -1, -1] },
      { color: '#ef6b7b', values: [null, 6, -1, 1, 2] },
      { color: '#61a8ff', values: [0, 5, 1, 4, 0] },
      { color: '#3fcbbb', values: [2, 5, 0, 4, 5] }
    ],
    min: -2, max: 7
  };

  function requestChartDraw() {
    cancelAnimationFrame(chartFrame);
    chartFrame = requestAnimationFrame(() => {
      Object.entries(chartDefinitions).forEach(([id, definition]) => drawLineChart(id, definition));
      drawBarChart('barChart', barDefinition);
    });
  }

  function prepareCanvas(id) {
    const canvas = document.getElementById(id);
    if (!canvas || !canvas.offsetParent) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 20 || rect.height < 20) return null;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { canvas, ctx, width: rect.width, height: rect.height };
  }

  function drawGrid(ctx, width, height, padding, min, max, labels) {
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;
    ctx.clearRect(0, 0, width, height);
    ctx.font = '9px system-ui';
    ctx.fillStyle = '#687386';
    ctx.strokeStyle = 'rgba(255,255,255,.07)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + plotH * i / 4;
      const value = Math.round(max - (max - min) * i / 4);
      ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(width - padding.right, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(String(value), padding.left - 8, y + 3);
    }
    labels.forEach((label, index) => {
      const x = padding.left + plotW * (labels.length === 1 ? .5 : index / (labels.length - 1));
      ctx.textAlign = 'center'; ctx.fillText(label, x, height - 8);
    });
    return { plotW, plotH };
  }

  function drawLineChart(id, definition) {
    const prepared = prepareCanvas(id);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const padding = { left: 38, right: 16, top: 12, bottom: 27 };
    const { plotW, plotH } = drawGrid(ctx, width, height, padding, definition.min, definition.max, definition.labels);
    definition.lines.forEach(line => {
      ctx.strokeStyle = line.color;
      ctx.fillStyle = line.color;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      let drawing = false;
      line.values.forEach((value, index) => {
        if (value === null || value === undefined) { drawing = false; return; }
        const x = padding.left + plotW * (definition.labels.length === 1 ? .5 : index / (definition.labels.length - 1));
        const y = padding.top + (definition.max - value) / (definition.max - definition.min) * plotH;
        if (!drawing) { ctx.moveTo(x, y); drawing = true; } else ctx.lineTo(x, y);
      });
      ctx.stroke();
      line.values.forEach((value, index) => {
        if (value === null || value === undefined) return;
        const x = padding.left + plotW * index / (definition.labels.length - 1);
        const y = padding.top + (definition.max - value) / (definition.max - definition.min) * plotH;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 1.3, 0, Math.PI * 2); ctx.fillStyle = '#111620'; ctx.fill(); ctx.fillStyle = line.color;
      });
    });
  }

  function drawBarChart(id, definition) {
    const prepared = prepareCanvas(id);
    if (!prepared) return;
    const { ctx, width, height } = prepared;
    const padding = { left: 38, right: 16, top: 12, bottom: 27 };
    const { plotW, plotH } = drawGrid(ctx, width, height, padding, definition.min, definition.max, definition.labels);
    const groupW = plotW / definition.labels.length;
    const barW = Math.min(14, groupW / (definition.series.length + 1));
    const zeroY = padding.top + (definition.max / (definition.max - definition.min)) * plotH;
    definition.series.forEach((series, seriesIndex) => {
      ctx.fillStyle = series.color;
      series.values.forEach((value, index) => {
        if (value === null || value === undefined) return;
        const center = padding.left + groupW * (index + .5);
        const x = center + (seriesIndex - (definition.series.length - 1) / 2) * barW - barW * .42;
        const valueY = padding.top + (definition.max - value) / (definition.max - definition.min) * plotH;
        ctx.fillRect(x, Math.min(valueY, zeroY), barW * .84, Math.max(1, Math.abs(zeroY - valueY)));
      });
    });
  }

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(requestChartDraw, 80);
  });

  const initialRoute = safeRoute(location.hash.slice(1));
  showDictionaryTab('lingo');
  showStatsTab('overall');
  showRoute(initialRoute, { focus: false });
})();
