chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'pin-to-sidebar',
      title: 'Pin to Sidebar',
      contexts: ['page']
    });
  });
});

function pinSite(url, title) {
  if (!url || !url.startsWith('http')) return;

  chrome.storage.sync.get(['pinnedSites'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error reading pinned sites:', chrome.runtime.lastError);
      return;
    }

    const pinnedSites = result.pinnedSites || [];
    // avoid duplicates based on url
    if (!pinnedSites.find(s => s.url === url)) {
      pinnedSites.push({ url, title: title || url });
      chrome.storage.sync.set({ pinnedSites }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving pinned site:', chrome.runtime.lastError);
        }
      });
    }
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pin-to-sidebar') {
    pinSite(info.pageUrl, tab.title);

    // Optionally try to open the side panel if we can (only possible if triggered from action but let's try)
    // contextMenus don't reliably open the side panel programmaticially in all versions without a user gesture
    // chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'pin-current-tab') {
    if (tab && tab.url) {
      pinSite(tab.url, tab.title);
    }
  }
});
