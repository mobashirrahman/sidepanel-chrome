chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'pin-to-sidebar',
    title: 'Pin to Sidebar',
    contexts: ['page']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pin-to-sidebar') {
    const url = info.pageUrl;
    const title = tab.title || url;
    
    chrome.storage.local.get(['pinnedSites'], (result) => {
      let pinnedSites = result.pinnedSites || [];
      // avoid duplicates based on url
      if (!pinnedSites.find(s => s.url === url)) {
        pinnedSites.push({ url, title });
        chrome.storage.local.set({ pinnedSites });
      }
    });

    // Optionally try to open the side panel if we can (only possible if triggered from action but let's try)
    // contextMenus don't reliably open the side panel programmaticially in all versions without a user gesture
    // chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
