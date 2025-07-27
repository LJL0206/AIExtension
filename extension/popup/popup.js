document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupPasswordToggle();
  loadSettings();
  loadSearchHistory();

  document.getElementById('save-settings').addEventListener('click', saveSettings);
  document.getElementById('clear-history').addEventListener('click', clearSearchHistory);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadSearchHistory();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'historyUpdated') loadSearchHistory();
});

function setupTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
}

function setupPasswordToggle() {
  const togglePassword = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('api-key');

  togglePassword.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    togglePassword.innerHTML = type === 'password'
      ? '<i class="fas fa-eye"></i>'
      : '<i class="fas fa-eye-slash"></i>';
  });
}

function loadSettings() {
  chrome.storage.local.get(['userLanguage', 'assistantActive', 'serverUrl', 'apiKey'], data => {
    document.getElementById('language-select').value = data.userLanguage || 'en-US';
    document.getElementById('assistant-toggle').checked = !!data.assistantActive;
    document.getElementById('server-url').value = data.serverUrl || 'http://localhost:3000';
    document.getElementById('api-key').value = data.apiKey || '';
  });
}

function saveSettings() {
  const settings = {
    userLanguage: document.getElementById('language-select').value,
    assistantActive: document.getElementById('assistant-toggle').checked,
    serverUrl: document.getElementById('server-url').value,
    apiKey: document.getElementById('api-key').value
  };

  chrome.storage.local.set(settings, () => {
    console.log("Settings saved:", settings);
    const msg = document.getElementById('success-message');
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
  });
}

function loadSearchHistory() {
  chrome.storage.local.get('searchHistory', (data) => {
    const historyList = document.getElementById('history-list');
    const history = data.searchHistory || [];

    console.log("Loaded history:", history);
    historyList.innerHTML = '';

    if (history.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.className = 'empty-history';
      emptyMessage.textContent = 'No recent searches found.';
      historyList.appendChild(emptyMessage);
    } else {
      history.sort((a, b) => b.timestamp - a.timestamp);
      history.forEach(item => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';

        const queryText = document.createElement('div');
        queryText.className = 'query-text';
        queryText.textContent = item.query;

        const timestamp = document.createElement('div');
        timestamp.className = 'timestamp';
        timestamp.textContent = formatDate(item.timestamp);

        historyItem.appendChild(queryText);
        historyItem.appendChild(timestamp);

        historyItem.addEventListener('click', () => {
          chrome.tabs.create({
            url: `https://www.google.com/search?q=${encodeURIComponent(item.query)}`
          });
        });

        historyList.appendChild(historyItem);
      });
    }
  });
}

function clearSearchHistory() {
  chrome.storage.local.set({ searchHistory: [] }, () => {
    console.log("Search history cleared");
    loadSearchHistory();
  });
}

function formatDate(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return `Yesterday at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}
