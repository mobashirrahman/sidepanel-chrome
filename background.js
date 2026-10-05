importScripts('workspaces.js');

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// The Drop feature was removed; its storage key has no reader left.
// Removing a missing key is a no-op, so this is safe on every service worker wake.
chrome.storage.local.remove('drops').catch((error) => console.error(error));

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
    chrome.contextMenus.create({
      id: 'ask-ai-selection',
      title: 'Ask AI about selection',
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'summarize-page',
      title: 'Summarize page with AI',
      contexts: ['page']
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'pin-to-sidebar') {
    const url = info.pageUrl;
    const title = tab.title || url;

    // Pins land in the active workspace; pinnedSites is mirrored there.
    globalThis.SidekickWorkspaces.addPin(url, title);

    // Optionally try to open the side panel if we can (only possible if triggered from action but let's try)
    // contextMenus don't reliably open the side panel programmaticially in all versions without a user gesture
    // chrome.sidePanel.open({ windowId: tab.windowId });
  }

  if (info.menuItemId === 'ask-ai-selection' || info.menuItemId === 'summarize-page') {
    handOffToAi(tab, info.menuItemId === 'ask-ai-selection' ? 'selection' : 'page');
  }
});

// Self-contained: chrome.scripting serializes this into the tab, so no
// closures or outside references allowed.
function extractForAi(mode) {
  const selection = (window.getSelection && window.getSelection().toString() || '').trim();
  if (mode === 'selection' && selection) {
    return { text: selection.slice(0, 6000), title: document.title, url: location.href };
  }
  const bodyText = (document.body && document.body.innerText) || '';
  return { text: bodyText.slice(0, 6000), title: document.title, url: location.href };
}

function buildAiPrompt(data, mode) {
  const head = mode === 'selection' ? 'Explain the following excerpt' : 'Summarize the key points';
  return `${head} from "${data.title || 'this page'}" (${data.url}):\n\n"""\n${data.text}\n"""`;
}

// Reads the tab, stashes a prompt handoff, and opens the panel. The panel
// consumes the handoff (copies it to the clipboard and focuses the AI
// provider) because clipboard writes from a service worker are unreliable.
function handOffToAi(tab, mode) {
  if (!tab || !tab.id || !/^https?:\/\//.test(tab.url || '')) return;
  chrome.scripting.executeScript(
    { target: { tabId: tab.id }, func: extractForAi, args: [mode] },
    (results) => {
      if (chrome.runtime.lastError || !results || !results[0] || !results[0].result) {
        return;
      }
      const data = results[0].result;
      if (!data.text) return;
      chrome.storage.local.set({
        aiHandoff: { prompt: buildAiPrompt(data, mode), title: data.title, url: data.url, ts: Date.now() },
      }).catch((error) => console.error(error));
      if (tab.windowId !== undefined) {
        chrome.sidePanel.open({ windowId: tab.windowId }).catch((error) => console.error(error));
      }
    }
  );
}

// Keyboard shortcuts (see manifest commands). A shortcut counts as a user
// gesture, so sidePanel.open works here. If the panel isn't open yet there is
// no message receiver, so the intent is stashed and the panel drains it once
// its rail is bound.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'next-pin' && command !== 'prev-pin' && command !== 'go-home') return;

  const msg = command === 'go-home'
    ? { type: 'sidekick-home' }
    : { type: 'sidekick-cycle', direction: command === 'next-pin' ? 1 : -1 };

  (async () => {
    try {
      if (tab && tab.windowId !== undefined) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      }
    } catch (error) {
      console.error(error);
    }
    try {
      await chrome.runtime.sendMessage(msg);
    } catch (error) {
      chrome.storage.local.set({ pendingPanelCommand: msg }).catch((e) => console.error(e));
    }
  })();
});
