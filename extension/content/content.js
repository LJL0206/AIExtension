if (!window.__aiSidebarInjected) {
  window.__aiSidebarInjected = true;

  let serverUrl = 'http://localhost:3000';
  let clientApiKey = '';
  let lastUrl = location.href;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let sessionChatHistory = JSON.parse(sessionStorage.getItem('chatHistory') || '[]');

  chrome.storage.local.get(['serverUrl', 'apiKey', 'assistantActive'], (data) => {
    if (data.serverUrl) serverUrl = data.serverUrl;
    if (data.apiKey) clientApiKey = data.apiKey;
    if (data.assistantActive ?? true) initializeSidebar();
  });

  function initializeSidebar() {
    injectStyles();
    createFloatingButton();
    renderSidebar();
    handleInitialQuery();
    observeUrlChange();
    observeDOMMutations();
    listenForToggle();
  }

  function handleInitialQuery() {
    const query = new URLSearchParams(location.search).get('q');
    const previousQuery = sessionStorage.getItem('lastQuery');

    if (query && query !== previousQuery) {
      sessionStorage.setItem('lastQuery', query);
      sessionChatHistory = [];
      sessionStorage.setItem('chatHistory', '[]');
      window.__initialQueryHandled = false;
    }

    if (query && !window.__initialQueryHandled) {
      window.__initialQueryHandled = true;
      appendMessage('User', query);
      appendMessage('AI', '<span class="typing-dots">Typing</span>');
      saveToHistory(query);
      fetchAIResponse(query);
    }
  }

  function observeUrlChange() {
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        chrome.storage.local.get('assistantActive', (data) => {
          (data.assistantActive ?? true) ? ensureReinjection() : removeSidebar();
        });
      }
    }, 1000);
  }

  function observeDOMMutations() {
    new MutationObserver(() => {
      if (!document.getElementById('assist-btn')) createFloatingButton();
    }).observe(document.body, { childList: true, subtree: true });
  }

  function listenForToggle() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.action === 'toggleAssistant') {
        msg.active ? ensureReinjection() : removeSidebar();
      }
    });
  }

  function ensureReinjection() {
    if (!document.getElementById('assist-btn')) createFloatingButton();
    if (!document.getElementById('ai-sidebar')) renderSidebar();
  }

  function injectStyles() {
    if (document.getElementById('ai-sidebar-css')) return;
    const css = document.createElement('link');
    css.id = 'ai-sidebar-css';
    css.rel = 'stylesheet';
    css.href = chrome.runtime.getURL('content/sidebar.css');
    document.head.appendChild(css);
  }

  function createFloatingButton() {
    if (document.getElementById('assist-btn')) return;
    const btn = document.createElement('div');
    btn.id = 'assist-btn';
    btn.textContent = 'Ask AI';
    btn.onclick = () => {
      const sidebar = document.getElementById('ai-sidebar');
      const isVisible = sidebar.style.display === 'none';
      sidebar.style.display = isVisible ? 'flex' : 'none';
      sidebar.classList.toggle('open', isVisible);
      sidebar.classList.remove('closed');
    };
    document.body.appendChild(btn);
  }

  function renderSidebar() {
    if (document.getElementById('ai-sidebar')) return;

    const sidebar = document.createElement('div');
    sidebar.id = 'ai-sidebar';
    sidebar.classList.toggle('dark-mode', prefersDark);
    sidebar.style.display = 'none';
    sidebar.innerHTML = `
      <div id="ai-sidebar-header">
        AI Assistant
        <button id="close-ai-sidebar">×</button>
      </div>
      <div id="ai-toolbar">
        <button id="summarize-page-btn">Summarize Page</button>
        <button id="extract-links-btn">Extract Links</button>
        <button id="toggle-theme-btn">Theme</button>
      </div>
      <div id="ai-sidebar-content">
        <p>Ask anything about this page or type your question below.</p>
      </div>
      <div id="ai-sidebar-input">
        <input type="text" id="ai-input-box" placeholder="Ask AI..." />
        <button id="ai-send-btn">Send</button>
      </div>
    `;

    document.body.appendChild(sidebar);

    document.getElementById('close-ai-sidebar').onclick = () => sidebar.style.display = 'none';
    document.getElementById('ai-send-btn').onclick = handleInput;
    document.getElementById('summarize-page-btn').onclick = summarizePage;
    document.getElementById('extract-links-btn').onclick = extractLinks;
    document.getElementById('toggle-theme-btn').onclick = toggleTheme;
    applyTheme();

    sessionChatHistory.forEach(({ sender, html }, i) => {
      appendMessage(sender, html, i !== sessionChatHistory.length - 1);
    });
  }

  function handleInput() {
    const input = document.getElementById('ai-input-box');
    const query = input.value.trim();
    if (!query) return;

    appendMessage('User', query);
    appendMessage('AI', '<span class="typing-dots">Typing</span>');
    input.value = '';
    saveToHistory(query);
    fetchAIResponse(query);
  }

  function fetchAIResponse(query) {
    chrome.storage.local.get(['searchHistory', 'userLanguage'], async (data) => {
      try {
        const res = await fetch(`${serverUrl}/api/search-enhance`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': clientApiKey
          },
          body: JSON.stringify({
            query,
            userHistory: data.searchHistory?.slice(-5) || [],
            language: data.userLanguage || 'en-US'
          })
        });
        const json = await res.json();
        updateLastMessage('AI', json.enhancedSearch || 'No response.');
      } catch {
        updateLastMessage('AI', 'Something went wrong. Please try again later.');
      }
    });
  }

  function summarizePage() {
    const pageText = Array.from(document.querySelectorAll('p, article, section'))
      .map(el => el.innerText)
      .join(' ')
      .slice(0, 8000);

    if (!pageText.trim()) {
      appendMessage('AI', 'No content available for summarization.');
      return;
    }

    appendMessage('User', 'Summarize this page');
    appendMessage('AI', '<span class="typing-dots">Typing</span>');

    chrome.storage.local.get('userLanguage', async ({ userLanguage }) => {
      try {
        const res = await fetch(`${serverUrl}/api/summarize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': clientApiKey
          },
          body: JSON.stringify({ content: pageText, language: userLanguage || 'en-US' })
        });
        const json = await res.json();
        updateLastMessage('AI', json.summary || 'No summary available.');
      } catch {
        updateLastMessage('AI', 'Failed to summarize the page.');
      }
    });
  }

  function extractLinks() {
    const links = Array.from(document.querySelectorAll('a'))
      .filter(a => a.href.startsWith('http'))
      .map(a => ({ href: a.href, text: a.innerText.trim() || a.href }));

    const uniqueLinks = Array.from(new Map(links.map(l => [l.href, l])).values());

    const formatted = uniqueLinks.slice(0, 30)
      .map(link => `• <a href="${link.href}" target="_blank" rel="noopener noreferrer">${link.text}</a>`)
      .join('<br>');

    appendMessage('User', 'Extract links from this page');
    appendMessage('AI', formatted || 'No valid links found.');
  }

  function appendMessage(sender, html, skipScroll = false) {
    const container = document.getElementById('ai-sidebar-content');
    const div = document.createElement('div');
    div.className = 'message';
    div.innerHTML = `<strong>${sender}</strong>: ${html}`;

    container.appendChild(div);

    sessionChatHistory.push({ sender, html });
    sessionStorage.setItem('chatHistory', JSON.stringify(sessionChatHistory));
    if (!skipScroll) container.scrollTop = container.scrollHeight;
  }

  function updateLastMessage(sender, text) {
  const container = document.getElementById('ai-sidebar-content');
  const messages = container.querySelectorAll('.message');
  if (!messages.length) return;

  const last = messages[messages.length - 1];
  const [before, suggestionsBlock, after] = splitByClarifiedSuggestions(text);

  function convertMarkdownLinksToHTML(str) {
    return str.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  function transformFollowUpQuestions(block) {
    const lines = block.split('\n');
    let inside = false;
    let hasQuestions = false;
    let html = `
      <div class="ai-section">
        <h4 class="ai-section-title"># Follow-Up Questions</h4>
        <ul class="ai-suggestion-list">`;

    for (const line of lines) {
      if (line.includes('# Follow-Up Questions')) {
        inside = true;
        continue;
      }
      if (inside && line.trim().startsWith('#')) break;
      const match = line.trim().match(/^[-•]\s+(.+)/);
      if (inside && match) {
        const question = match[1].trim();
        hasQuestions = true;
        html += `
          <li class="ai-suggestion-item">
            <button class="follow-up-btn" data-question="${question}">${question}</button>
          </li>`;
      }
    }

    html += hasQuestions
      ? '</ul></div>'
      : `</ul><p class="ai-message-text" style="opacity: 0.6; margin-left: 12px;">No follow-up questions provided.</p></div>`;

    return html;
  }

  let html = '';

  if (before.trim()) {
    const converted = convertMarkdownLinksToHTML(before.trim());
    html += `
      <div class="ai-section">
        <div class="ai-message-text">${converted.replace(/\n/g, '<br>')}</div>
      </div>`;
  }

  if (suggestionsBlock.trim()) {
    html += transformClarifiedSuggestions(suggestionsBlock);
  }

  const followUpStart = after.indexOf('# Follow-Up Questions');
  let followUpBlock = '', remainingAfter = after;
  if (followUpStart !== -1) {
    followUpBlock = after.slice(followUpStart);
    remainingAfter = after.slice(0, followUpStart);
  }

  html += transformFollowUpQuestions(followUpBlock || '');

  if (remainingAfter.trim()) {
    const converted = convertMarkdownLinksToHTML(remainingAfter.trim());
    html += `
      <div class="ai-section">
        <div class="ai-message-text">${converted.replace(/\n/g, '<br>')}</div>
      </div>`;
  }

  last.innerHTML = `<strong>${sender}</strong>: ${html}`;

  if (sessionChatHistory.length) {
    sessionChatHistory[sessionChatHistory.length - 1] = { sender, html };
    sessionStorage.setItem('chatHistory', JSON.stringify(sessionChatHistory));
  }

  document.querySelectorAll('.inline-search-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const query = e.target.dataset.query;
      if (query) {
        window.location.href = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      }
    });
  });

  document.querySelectorAll('.follow-up-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const question = e.target.dataset.question;
      if (question) {
        appendMessage('User', question);
        appendMessage('AI', '<span class="typing-dots">Typing</span>');
        saveToHistory(question);
        fetchAIResponse(question);
      }
    });
  });

  container.scrollTop = container.scrollHeight;
}

  function splitByClarifiedSuggestions(text) {
    const lines = text.split('\n');
    const startIdx = lines.findIndex(line => line.includes('# Clarified Search Suggestions'));
    if (startIdx === -1) return [text, '', ''];
    const before = lines.slice(0, startIdx).join('\n');
    let endIdx = lines.length;
    for (let i = startIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('#') && i > startIdx + 1) {
        endIdx = i;
        break;
      }
    }
    const suggestionsBlock = lines.slice(startIdx, endIdx).join('\n');
    const after = lines.slice(endIdx).join('\n');
    return [before, suggestionsBlock, after];
  }

  function transformClarifiedSuggestions(text) {
    const lines = text.split('\n');
    let inside = false;
    let html = `
      <div class="ai-section">
        <h4 class="ai-section-title"># Clarified Search Suggestions</h4>
        <ul class="ai-suggestion-list">`;

    for (const line of lines) {
      if (line.includes('# Clarified Search Suggestions')) {
        inside = true;
        continue;
      }
      if (inside && line.trim().startsWith('#')) break;
      const match = line.trim().match(/^[-\d.]+\s+["“”']?(.+?)["“”']?$/);
      if (inside && match) {
        const query = match[1].trim();
        html += `
          <li class="ai-suggestion-item">
            <button class="inline-search-btn" data-query="${query}">${query}</button>
          </li>`;
      }
    }

    html += '</ul></div>';
    return html;
  }

  function saveToHistory(query) {
    chrome.storage.local.get('searchHistory', ({ searchHistory = [] }) => {
      if (searchHistory.some(item => item.query === query && Date.now() - item.timestamp < 60000)) return;
      searchHistory.push({ query, timestamp: Date.now() });
      chrome.storage.local.set({ searchHistory });
    });
  }

  function toggleTheme() {
    chrome.storage.local.get('themeMode', (data) => {
      const current = data.themeMode || (prefersDark ? 'dark' : 'light');
      const next = current === 'dark' ? 'light' : 'dark';
      chrome.storage.local.set({ themeMode: next }, applyTheme);
    });
  }

  function applyTheme() {
    chrome.storage.local.get('themeMode', (data) => {
      const isDark = data.themeMode === 'dark' || (!data.themeMode && prefersDark);
      document.body.classList.toggle('dark-mode', isDark);
      const sidebar = document.getElementById('ai-sidebar');
      if (sidebar) sidebar.classList.toggle('dark-mode', isDark);
      const toggleBtn = document.getElementById('toggle-theme-btn');
      if (toggleBtn) toggleBtn.textContent = isDark ? 'Light' : 'Dark';
    });
  }

  function removeSidebar() {
    document.getElementById('ai-sidebar')?.remove();
    document.getElementById('assist-btn')?.remove();
  }

  document.addEventListener('fullscreenchange', () => {
    const isFull = document.fullscreenElement !== null;
    const btn = document.getElementById('assist-btn');
    const sidebar = document.getElementById('ai-sidebar');
    if (btn) btn.style.display = isFull ? 'none' : 'block';
    if (sidebar && isFull) sidebar.style.display = 'none';
  });
}
