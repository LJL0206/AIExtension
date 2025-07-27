// Set default config on install
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      userLanguage: 'en-US',
      assistantActive: true,
      serverUrl: 'http://localhost:3000',
      apiKey: '',
      searchHistory: []
    });

    chrome.tabs.create({ url: 'popup/popup.html' });
  }
});

// Handle messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'checkSettings':
      chrome.storage.local.get(['assistantActive', 'serverUrl', 'apiKey'], (data) => {
        sendResponse({
          assistantActive: data.assistantActive !== false,
          serverUrl: data.serverUrl || 'http://localhost:3000',
          apiKey: data.apiKey || ''
        });
      });
      return true;

    case 'askAI':
      chrome.storage.local.get(['serverUrl', 'apiKey'], async ({ serverUrl, apiKey }) => {
        try {
          const response = await fetch(`${serverUrl}/api/search-enhance`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey
            },
            body: JSON.stringify({
              query: request.query,
              userHistory: [],
              language: 'en-US'
            })
          });

          const data = await response.json();

          chrome.tabs.sendMessage(sender.tab.id, {
            action: 'showAIResponse',
            result: data.enhancedSearch
          });
        } catch (err) {
          console.error('Failed to fetch AI response:', err);
        }
      });
      return true;

    default:
      console.warn('Unhandled background message:', request);
      break;
  }
});
