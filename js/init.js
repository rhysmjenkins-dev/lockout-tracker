// Initialisation

window.addEventListener('DOMContentLoaded', function() {
  console.log('Lockout Tracker v3.0 - Optimized & Bug-Free! 🚀');
  ensurePlayersLoaded();
  checkActiveSessions();
  
  // Show lingo section by default in dictionary
  showDictionarySection('lingo');
  
  // Set initial history state
  history.replaceState({ screen: 'homeScreen' }, '', '#homeScreen');
});

// ============================================
// BROWSER BACK BUTTON HANDLING
// ============================================

window.addEventListener('popstate', function(event) {
  if (event.state && event.state.screen) {
    // Navigate to the screen from history without adding another history entry
    showScreen(event.state.screen, true);
  } else {
    // If no state, go to home screen
    showScreen('homeScreen', true);
  }
});

// ============================================
// HAPTIC FEEDBACK EVENT LISTENER
// ============================================

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('btn')) {
    hapticFeedback('light');
  }
});

// ============================================
// DICTIONARY SECTION TOGGLE
// ============================================

function showDictionarySection(section) {
  if (section === 'lingo') {
    document.getElementById('lingoSection').style.display = 'block';
    document.getElementById('glossarySection').style.display = 'none';
  } else {
    document.getElementById('lingoSection').style.display = 'none';
    document.getElementById('glossarySection').style.display = 'block';
  }
}

// ============================================
// SESSION SEARCH FILTER
// ============================================

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

// ============================================
// EASTER EGG
// ============================================

// Mobile easter egg (tap header 7 times)
let headerTapCount = 0;
let headerTapTimeout;

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

// Desktop easter egg (type "lockout")
let easterEggCode = '';
let easterEggTimeout;

document.addEventListener('keypress', function(e) {
  clearTimeout(easterEggTimeout);
  easterEggCode += e.key.toLowerCase();
  
  // Check for secret code
  if (easterEggCode.includes('lockout')) {
    easterEggCode = '';
    triggerEasterEgg();
  }
  
  // Reset after 2 seconds of no typing
  easterEggTimeout = setTimeout(function() {
    easterEggCode = '';
  }, 2000);
});

function triggerEasterEgg() {
  // Epic confetti
  const duration = 3000;
  const end = Date.now() + duration;
  
  (function frame() {
    confetti({
      particleCount: 3,
      angle: 60,
      spread: 55,
      origin: { x: 0 },
      colors: ['#667eea', '#764ba2', '#f5576c']
    });
    confetti({
      particleCount: 3,
      angle: 120,
      spread: 55,
      origin: { x: 1 },
      colors: ['#667eea', '#764ba2', '#f5576c']
    });
    
    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  }());
  
  // Show message
  const message = document.createElement('div');
  message.style.cssText = 'position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 50px; border-radius: 20px; font-size: 2em; font-weight: bold; z-index: 10000; box-shadow: 0 10px 40px rgba(0,0,0,0.3); animation: fadeIn 0.5s ease-in-out;';
  message.textContent = '🎉 YOU FOUND THE SECRET! 🎉';
  document.body.appendChild(message);
  
  hapticFeedback('success');
  
  setTimeout(function() {
    message.style.opacity = '0';
    message.style.transform = 'translate(-50%, -50%) scale(0.8)';
    message.style.transition = 'all 0.5s ease-out';
    setTimeout(function() {
      document.body.removeChild(message);
    }, 500);
  }, 3000);
}
