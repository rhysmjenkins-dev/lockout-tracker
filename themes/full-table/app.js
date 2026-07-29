(() => {
  "use strict";

  const players = [
    { name: "Dave", initials: "D", avatar: "dave", rating: "1,069", change: "+18", sessions: 11, wins: 5, winRate: "45.5%", avg: "2.18", bio: "A consistent finisher with the group's highest current rating." },
    { name: "Rhys", initials: "RJ", avatar: "rhys", rating: "1,024", change: "+8", sessions: 11, wins: 3, winRate: "27.3%", avg: "2.34", bio: "Regular host and scorekeeper." },
    { name: "Jack", initials: "J", avatar: "jack", rating: "1,018", change: "+20", sessions: 9, wins: 2, winRate: "22.2%", avg: "1.82", bio: "Strong recent form and the best current average hand score." },
    { name: "Ollie", initials: "O", avatar: "ollie", rating: "996?", change: "−4", sessions: 5, wins: 1, winRate: "20.0%", avg: "2.65", bio: "A provisional player building a first run of official results." },
    { name: "Tom", initials: "T", avatar: "tom", rating: "984?", change: "+2", sessions: 4, wins: 0, winRate: "0.0%", avg: "2.91", bio: "A newer member of the table with a provisional rating." },
    { name: "Jake", initials: "J", avatar: "jake", rating: "971?", change: "−19", sessions: 7, wins: 0, winRate: "0.0%", avg: "3.12", bio: "A regular player with seven sessions recorded." },
    { name: "Sam", initials: "S", avatar: "rhys", rating: "958?", change: "−6", sessions: 3, wins: 0, winRate: "0.0%", avg: "3.35", bio: "A recent addition to the player list." },
    { name: "Russ", initials: "R", avatar: "russ", rating: "939", change: "+7", sessions: 8, wins: 1, winRate: "12.5%", avg: "2.51", bio: "Eight sessions recorded and the best current average declaration score." }
  ];

  const routes = {
    home: { title: "Home", eyebrow: "Club table" },
    start: { title: "Start session", eyebrow: "Play" },
    active: { title: "Wednesday cards", eyebrow: "Active session" },
    players: { title: "Players", eyebrow: "Explore" },
    profile: { title: "Player profile", eyebrow: "Players" },
    sessions: { title: "Previous sessions", eyebrow: "Explore" },
    "session-detail": { title: "Session detail", eyebrow: "Previous sessions" },
    stats: { title: "Statistics", eyebrow: "Explore" },
    podcasts: { title: "Podcasts", eyebrow: "Explore" },
    "add-player": { title: "Add player", eyebrow: "Players" },
    howto: { title: "How to use", eyebrow: "Reference" },
    dictionary: { title: "Dictionary", eyebrow: "Reference" },
    rules: { title: "Rules", eyebrow: "Reference" }
  };

  const sessions = {
    "280726 Lunch": { date: "28 July 2026", winner: "Jack", score: "−1", hands: "5", players: "4", lockouts: "3", falseLockouts: "1" },
    "Tipsy Toad": { date: "25 July 2026", winner: "Dave", score: "11", hands: "9", players: "5", lockouts: "7", falseLockouts: "2" },
    "Sunday cards": { date: "19 July 2026", winner: "Russ", score: "8", hands: "7", players: "4", lockouts: "5", falseLockouts: "1" },
    "Holiday table": { date: "5 July 2026", winner: "Ollie", score: "17", hands: "12", players: "4", lockouts: "8", falseLockouts: "3" }
  };

  const screenTitle = document.getElementById("screenTitle");
  const screenEyebrow = document.getElementById("screenEyebrow");
  const sidebar = document.getElementById("sidebar");
  const menuButton = document.getElementById("menuButton");
  const toast = document.getElementById("toast");
  const playerGrid = document.getElementById("playerGrid");
  let currentRoute = "home";
  let activeModal = null;
  let modalTrigger = null;
  let pinDigits = "";
  let pendingPlayer = "Rhys";
  let toastTimer = 0;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3200);
  }

  function renderPlayers(filter = "") {
    const query = filter.trim().toLowerCase();
    const matches = players.filter((player) => player.name.toLowerCase().includes(query));
    playerGrid.innerHTML = matches.length
      ? matches.map((player) => `
          <button class="player-card" type="button" data-player="${escapeHtml(player.name)}">
            <span class="player-card-top">
              <span class="avatar avatar-lg avatar-${escapeHtml(player.avatar)}">${escapeHtml(player.initials)}</span>
              <span class="rating-pill">⚡ ${escapeHtml(player.rating)}</span>
            </span>
            <h2>${escapeHtml(player.name)}</h2>
            <p>${escapeHtml(player.sessions)} official sessions</p>
            <span class="player-card-stats">
              <span><small>Session wins</small><b>${escapeHtml(player.wins)}</b></span>
              <span><small>Win rate</small><b>${escapeHtml(player.winRate)}</b></span>
              <span><small>Avg hand</small><b>${escapeHtml(player.avg)}</b></span>
              <span><small>Latest ELO</small><b class="${player.change.startsWith("+") ? "positive" : "negative"}">${escapeHtml(player.change)}</b></span>
            </span>
          </button>`).join("")
      : `<article class="panel"><h2>No players found</h2><p>Try a different name.</p></article>`;
  }

  function setPlayerProfile(name) {
    const player = players.find((item) => item.name === name) || players[1];
    document.getElementById("profileName").textContent = player.name;
    document.getElementById("profileBio").textContent = player.bio;
    document.getElementById("profileRating").textContent = player.rating;
    const avatar = document.getElementById("profileAvatar");
    avatar.className = `avatar avatar-xl avatar-${player.avatar}`;
    avatar.textContent = player.initials;
    const editButton = document.getElementById("editProfileButton");
    editButton.hidden = player.name !== "Rhys";
    screenTitle.textContent = player.name;
  }

  function setSessionDetail(name) {
    const session = sessions[name] || sessions["280726 Lunch"];
    document.getElementById("sessionDetailName").textContent = name;
    const kicker = document.querySelector("#screen-session-detail .kicker");
    kicker.innerHTML = `<span class="suit-red">♦</span> Completed · ${escapeHtml(session.date)}`;
    const winner = document.querySelector("#screen-session-detail .winner-display h2");
    const result = document.querySelector("#screen-session-detail .winner-display p:last-child");
    winner.textContent = session.winner;
    result.textContent = `Finished on ${session.score} after ${session.hands} hands`;
    const facts = document.querySelectorAll("#screen-session-detail .session-facts strong");
    [session.hands, session.players, session.lockouts, session.falseLockouts].forEach((value, index) => {
      if (facts[index]) facts[index].textContent = value;
    });
    screenTitle.textContent = name;
    if (name !== "280726 Lunch") {
      showToast("This prototype uses the 280726 Lunch hand table as its detailed fixture.");
    }
  }

  function updateNav(route) {
    document.querySelectorAll(".nav-link").forEach((button) => {
      const selected = button.dataset.route === route || (route === "profile" && button.dataset.route === "players") || (route === "session-detail" && button.dataset.route === "sessions") || (route === "add-player" && button.dataset.route === "players");
      button.classList.toggle("is-active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
  }

  function showRoute(route, options = {}) {
    if (!routes[route]) route = "home";
    currentRoute = route;
    document.querySelectorAll("[data-screen]").forEach((screen) => {
      screen.classList.toggle("is-active", screen.dataset.screen === route);
    });
    screenTitle.textContent = routes[route].title;
    screenEyebrow.textContent = routes[route].eyebrow;
    updateNav(route);
    sidebar.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    if (!options.keepScroll) window.scrollTo({ top: 0, behavior: "instant" });
    if (options.push !== false) history.pushState({ route }, "", `#${route}`);
    document.title = `${routes[route].title} · Lockout Tracker Table Edition`;
  }

  function navigate(route, options = {}) {
    showRoute(route, options);
    if (options.statsTab) activateStatsTab(options.statsTab);
    if (options.anchor) {
      window.requestAnimationFrame(() => {
        document.getElementById(options.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  function activateStatsTab(tab) {
    document.querySelectorAll("[data-tab-target]").forEach((button) => {
      const active = button.dataset.tabTarget === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-tab-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.tabPanel === tab));
  }

  function activateDictionaryTab(tab) {
    document.querySelectorAll("[data-dictionary-tab]").forEach((button) => {
      const active = button.dataset.dictionaryTab === tab;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
    });
    document.querySelectorAll("[data-dictionary-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.dictionaryPanel === tab));
  }

  function openModal(id, trigger = document.activeElement) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (activeModal) closeModal(activeModal, false);
    modal.hidden = false;
    activeModal = modal;
    modalTrigger = trigger;
    document.body.classList.add("modal-open");
    window.requestAnimationFrame(() => {
      const focusTarget = modal.querySelector("input:not([type='hidden']), select, textarea, button:not([data-close-modal])") || modal.querySelector("button");
      focusTarget?.focus();
    });
  }

  function closeModal(modal = activeModal, restoreFocus = true) {
    if (!modal) return;
    modal.hidden = true;
    activeModal = null;
    document.body.classList.remove("modal-open");
    pinDigits = "";
    updatePinDots();
    if (restoreFocus) modalTrigger?.focus();
  }

  function updatePinDots() {
    document.querySelectorAll(".pin-dots i").forEach((dot, index) => dot.classList.toggle("is-filled", index < pinDigits.length));
  }

  function openPinFor(player) {
    pendingPlayer = player;
    closeModal(activeModal, false);
    document.getElementById("pinPrompt").textContent = `Enter the four-digit PIN for ${player}.`;
    openModal("pinModal");
  }

  function submitPin() {
    if (pinDigits.length !== 4) {
      showToast("Enter all four digits first.");
      return;
    }
    closeModal();
    showToast(`Playing as ${pendingPlayer} · prototype only.`);
  }

  function filterContainer(input, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const query = input.value.trim().toLowerCase();
    container.querySelectorAll("[data-search-item]").forEach((item) => {
      item.dataset.searchHidden = String(!item.dataset.searchItem.includes(query));
    });
  }

  function runDemoForm(form) {
    const label = form.dataset.demoForm || "This action";
    const modal = form.closest(".modal");
    if (modal) closeModal(modal);
    showToast(`${label} was not saved — this is a visual prototype.`);
    if (form.closest("#screen-start")) navigate("active");
    if (form.closest("#screen-add-player")) navigate("players");
  }

  document.addEventListener("click", (event) => {
    const routeButton = event.target.closest("[data-route]");
    if (routeButton) {
      const options = {};
      if (routeButton.dataset.statsTab) options.statsTab = routeButton.dataset.statsTab;
      if (routeButton.dataset.anchor) options.anchor = routeButton.dataset.anchor;
      navigate(routeButton.dataset.route, options);
      return;
    }

    const playerButton = event.target.closest("[data-player]");
    if (playerButton) {
      setPlayerProfile(playerButton.dataset.player);
      navigate("profile");
      setPlayerProfile(playerButton.dataset.player);
      return;
    }

    const sessionButton = event.target.closest("[data-session]");
    if (sessionButton) {
      navigate("session-detail");
      setSessionDetail(sessionButton.dataset.session);
      return;
    }

    const modalButton = event.target.closest("[data-modal]");
    if (modalButton) {
      openModal(modalButton.dataset.modal, modalButton);
      return;
    }

    if (event.target.closest("[data-close-modal]")) {
      closeModal(event.target.closest(".modal") || activeModal);
      return;
    }

    const statsTab = event.target.closest("[data-tab-target]");
    if (statsTab) {
      activateStatsTab(statsTab.dataset.tabTarget);
      return;
    }

    const dictionaryTab = event.target.closest("[data-dictionary-tab]");
    if (dictionaryTab) {
      activateDictionaryTab(dictionaryTab.dataset.dictionaryTab);
      return;
    }

    const layoutButton = event.target.closest("[data-layout]");
    if (layoutButton) {
      document.querySelectorAll("[data-layout]").forEach((button) => button.classList.toggle("is-active", button === layoutButton));
      playerGrid.classList.toggle("is-list", layoutButton.dataset.layout === "list");
      return;
    }

    const pinPlayer = event.target.closest("[data-open-pin]");
    if (pinPlayer) {
      openPinFor(pinPlayer.dataset.openPin);
      return;
    }

    const pinKey = event.target.closest("[data-pin]");
    if (pinKey) {
      if (pinDigits.length < 4) pinDigits += pinKey.dataset.pin;
      updatePinDots();
      if (pinDigits.length === 4) window.setTimeout(submitPin, 240);
      return;
    }

    if (event.target.closest("[data-pin-clear]")) {
      pinDigits = pinDigits.slice(0, -1);
      updatePinDots();
      return;
    }

    if (event.target.closest("[data-pin-submit]")) {
      submitPin();
      return;
    }

    const audioButton = event.target.closest("[data-audio-button]");
    if (audioButton) {
      const playing = audioButton.classList.toggle("is-playing");
      audioButton.textContent = playing ? "Ⅱ" : "▶";
      audioButton.setAttribute("aria-label", playing ? "Pause episode preview" : "Play episode preview");
      showToast("Audio is represented visually in this prototype.");
      return;
    }

    const guideButton = event.target.closest("[data-guide-jump]");
    if (guideButton) {
      document.querySelectorAll("[data-guide-jump]").forEach((button) => button.classList.toggle("is-active", button === guideButton));
      document.getElementById(guideButton.dataset.guideJump)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const comparisonButton = event.target.closest("[data-comparison]");
    if (comparisonButton) {
      navigate("stats");
      activateStatsTab("comparison");
      showToast(`Showing the detailed comparison layout for ${comparisonButton.dataset.comparison.replace("|", " and ")}.`);
      return;
    }

    const demoAction = event.target.closest("[data-demo-action]");
    if (demoAction) {
      showToast(`${demoAction.dataset.demoAction} is visual only; nothing was changed.`);
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-demo-form]");
    if (!form) return;
    event.preventDefault();
    runDemoForm(form);
  });

  document.addEventListener("input", (event) => {
    if (event.target.id === "playerSearch") {
      renderPlayers(event.target.value);
      return;
    }

    if (event.target.id === "sessionSearch") {
      const query = event.target.value.trim().toLowerCase();
      document.querySelectorAll("#sessionArchive [data-search-item]").forEach((item) => {
        const type = document.getElementById("sessionFilter").value;
        const matchesText = item.dataset.searchItem.includes(query);
        const matchesType = type === "all" || item.dataset.searchItem.includes(type);
        item.dataset.searchHidden = String(!(matchesText && matchesType));
      });
      return;
    }

    if (event.target.id === "glossarySearch") {
      filterContainer(event.target, "glossaryList");
      return;
    }

    if (event.target.matches("[data-player-search]")) {
      filterContainer(event.target, event.target.dataset.playerSearch);
    }
  });

  document.addEventListener("change", (event) => {
    if (event.target.id === "sessionFilter") {
      document.getElementById("sessionSearch").dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    if (event.target.closest("#session-player-list")) {
      const count = document.querySelectorAll("#session-player-list input:checked").length;
      document.querySelector("#screen-start .selection-count").textContent = `${count} selected`;
    }
  });

  menuButton.addEventListener("click", () => {
    const open = sidebar.classList.toggle("is-open");
    menuButton.setAttribute("aria-expanded", String(open));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (activeModal) closeModal();
      else {
        sidebar.classList.remove("is-open");
        menuButton.setAttribute("aria-expanded", "false");
      }
    }
  });

  window.addEventListener("popstate", () => {
    const route = location.hash.slice(1);
    showRoute(routes[route] ? route : "home", { push: false });
  });

  renderPlayers();
  activateDictionaryTab("lingo");
  const initialRoute = location.hash.slice(1);
  showRoute(routes[initialRoute] ? initialRoute : "home", { push: false });
  history.replaceState({ route: currentRoute }, "", `#${currentRoute}`);
})();
