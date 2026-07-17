// API & Data Management
let allPlayers = [];
let playersLoaded = false;
let playerCache = {};

async function apiCall(action, params) {
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
}

async function ensurePlayersLoaded() {
  if (playersLoaded) return allPlayers;
  const data = await apiCall('getPlayers', {});
  if (data.error) {
    console.error('Error loading players:', data.error);
    return [];
  }
  allPlayers = data;
  playersLoaded = true;
  for (let i = 0; i < data.length; i++) {
    playerCache[data[i].player_id] = data[i].username;
  }
  return allPlayers;
}
