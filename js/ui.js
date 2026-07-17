// UI & Screen Management

function showScreen(screenId, skipHistory) {
  const screens = document.querySelectorAll('.screen');
  
  const currentScreen = document.querySelector('.screen.active');
  if (currentScreen) {
    currentScreen.style.opacity = '0';
    currentScreen.style.transform = 'translateY(-10px)';
  }
  
  setTimeout(function() {
    for (let i = 0; i < screens.length; i++) {
      screens[i].classList.remove('active');
      screens[i].style.opacity = '';
      screens[i].style.transform = '';
    }
    document.getElementById(screenId).classList.add('active');
    window.scrollTo(0, 0);
  }, 150);
  
  if (!skipHistory) {
    history.pushState({ screen: screenId }, '', '#' + screenId);
  }
  
  if (screenId === 'startSessionScreen') {
    setTimeout(function() {
      loadPlayersForSession();
    }, 150);
  }
}

function showDictionarySection(section) {
  if (section === 'lingo') {
    document.getElementById('lingoSection').style.display = 'block';
    document.getElementById('glossarySection').style.display = 'none';
  } else {
    document.getElementById('lingoSection').style.display = 'none';
    document.getElementById('glossarySection').style.display = 'block';
  }
}

function filterSessions() {
  const searchTerm = document.getElementById('sessionSearchInput').value.toLowerCase();
  const sessionItems = document.querySelectorAll('.session-item');
  
  for (let i = 0; i < sessionItems.length; i++) {
    const item = sessionItems[i];
    const text = item.textContent.toLowerCase();
    
    if (text.indexOf(searchTerm) !== -1) {
      item.style.display = 'block';
    } else {
      item.style.display = 'none';
    }
  }
}

// Table Sorting
let currentSortColumn = -1;
let currentSortAscending = true;
let currentSessionSortColumn = -1;
let currentSessionSortAscending = true;
let currentActiveSortColumn = -1;
let currentActiveSortAscending = true;

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
  
  hapticFeedback('light');
}

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
  
  hapticFeedback('light');
}

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
  
  hapticFeedback('light');
}

// Easter Egg
let headerTapCount = 0;
let headerTapTimeout;
let easterEggCode = '';
let easterEggTimeout;

function handleHeaderClick(event) {
  headerTapCount++;
  clearTimeout(headerTapTimeout);
  
  if (headerTapCount >= 7) {
    headerTapCount = 0;
    triggerEasterEgg();
  } else {
    headerTapTimeout = setTimeout(function() {
      if (headerTapCount < 7) {
        showScreen('homeScreen');
      }
      headerTapCount = 0;
    }, 800);
  }
}

function triggerEasterEgg() {
  celebrateWinner('');
}
