document.addEventListener('DOMContentLoaded', () => {
  const iframe = document.getElementById('main-frame');
  const loading = document.getElementById('loading');
  const pinnedContainer = document.getElementById('pinned-sites-container');
  
  // Modals
  const settingsModal = document.getElementById('settings-modal');
  const settingsBtn = document.getElementById('settings-btn');
  const closeSettings = document.getElementById('close-settings');
  
  const addModal = document.getElementById('add-modal');
  const addBtn = document.getElementById('add-btn');
  const closeAdd = document.getElementById('close-add');
  
  // Settings Inputs
  const aiProviderSelect = document.getElementById('ai-provider');
  const appearanceRadios = document.getElementsByName('appearanceMode');
  
  // Add Pin Inputs
  const pinUrlInput = document.getElementById('pin-url');
  const addCustomLinkBtn = document.getElementById('add-custom-link-btn');
  const addCurrentTabBtn = document.getElementById('add-current-tab-btn');

  // Home AI Icon
  const homeAiIcon = document.getElementById('home-ai-icon');
  const homeAiImg = document.getElementById('home-ai-img');
  const homeAiSvg = document.getElementById('home-ai-svg');

  // App Bar Elements
  const appBar = document.getElementById('app-bar');
  const appTitle = document.getElementById('app-title');
  const appUrl = document.getElementById('app-url');
  const barSplit = document.getElementById('bar-split');
  const barOpenMain = document.getElementById('bar-open-main');
  const barMenuTrigger = document.getElementById('bar-menu-trigger');
  const barMenu = document.getElementById('bar-menu');
  const menuRefresh = document.getElementById('menu-refresh');
  const menuCopy = document.getElementById('menu-copy');
  const menuDesktopBtn = document.getElementById('menu-desktop');
  const desktopToggle = document.getElementById('desktop-toggle');
  const menuTouchBtn = document.getElementById('menu-touch');
  const touchToggle = document.getElementById('touch-toggle');
  const barMinimize = document.getElementById('bar-minimize');
  const barClose = document.getElementById('bar-close');

  // Split View Elements
  const secondaryWorkspace = document.getElementById('secondary-workspace');
  const splitDivider = document.getElementById('split-divider');
  const secondaryFrame = document.getElementById('secondary-frame');

  // Load Initial Settings
  let currentAiProvider = 'https://copilot.microsoft.com/';
  let desktopSites = [];
  let isSplitView = false;
  
  chrome.storage.local.get(['aiProvider', 'appearanceMode', 'desktopSites'], (result) => {
    if (result.aiProvider) {
      currentAiProvider = result.aiProvider;
      aiProviderSelect.value = currentAiProvider;
    }
    
    if (result.appearanceMode) {
      for (const radio of appearanceRadios) {
        if (radio.value === result.appearanceMode) radio.checked = true;
      }
    }

    if (result.desktopSites) {
      desktopSites = result.desktopSites;
    }

    updateHomeIcon(currentAiProvider);
    // Initialize frame with AI Provider
    loadUrl(currentAiProvider);
    setActiveIcon(currentAiProvider);
  });

  // Basic frame loading handling
  iframe.addEventListener('load', () => {
    loading.classList.add('hidden');
  });

  function loadUrl(url) {
    loading.classList.remove('hidden');
    iframe.src = url;
  }

  function updateHomeIcon(url) {
    homeAiIcon.dataset.url = url;
    try {
      const hostname = new URL(url).hostname;
      homeAiIcon.title = hostname;
    } catch {}

    if (url === 'https://copilot.microsoft.com/') {
      homeAiSvg.style.display = 'block';
      homeAiImg.style.display = 'none';
      homeAiImg.src = '';
    } else {
      homeAiSvg.style.display = 'none';
      homeAiImg.style.display = 'block';
      homeAiImg.src = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
    }
  }

  function getSiteTitle(url) {
    // try to find title from pinned list
    const el = document.querySelector(`.app-icon[data-url="${url}"]`);
    if (el && el.title) return el.title;
    try { return new URL(url).hostname; } catch { return url; }
  }

  function setActiveIcon(url) {
    document.querySelectorAll('.app-icon').forEach(icon => {
      icon.classList.remove('active');
      if (icon.dataset.url === url) {
        icon.classList.add('active');
      }
    });

    // Handle App Bar Visibility & State
    if (url === currentAiProvider) {
      appBar.classList.add('hidden');
      
      // Auto-collapse split view when dropping back to Home AI to prevent duplicates
      if (isSplitView) {
        isSplitView = false;
        secondaryWorkspace.classList.add('hidden');
        splitDivider.classList.add('hidden');
        barSplit.style.color = '';
      }
    } else {
      appBar.classList.remove('hidden');
      appTitle.textContent = getSiteTitle(url);
      appUrl.textContent = url;
      
      // Update toggles based on settings
      try {
        const hostname = new URL(url).hostname;
        desktopToggle.checked = desktopSites.includes(hostname);
      } catch {}
    }
  }

  function bindIconEvents() {
    document.querySelectorAll('.app-icon').forEach(icon => {
      icon.onclick = (e) => {
        const targetUrl = icon.dataset.url;
        setActiveIcon(targetUrl);
        loadUrl(targetUrl);
      };
      
      icon.oncontextmenu = (e) => {
        e.preventDefault();
        const targetUrl = icon.dataset.url;
        if (icon.id === 'home-ai-icon' || targetUrl === 'https://www.bing.com/search?q=weather') return;
        
        if (confirm(`Remove this pinned site?`)) {
          deletePin(targetUrl);
        }
      };
    });
  }

  function renderPinnedSites() {
    chrome.storage.local.get(['pinnedSites'], (result) => {
      const sites = result.pinnedSites || [];
      pinnedContainer.innerHTML = '';
      sites.forEach(site => {
        const div = document.createElement('div');
        div.className = 'app-icon';
        div.dataset.url = site.url;
        div.title = site.title;
        
        const img = document.createElement('img');
        img.src = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`;
        
        div.appendChild(img);
        pinnedContainer.appendChild(div);
      });
      bindIconEvents();
      setActiveIcon(iframe.src);
    });
  }

  setTimeout(() => renderPinnedSites(), 100);

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.pinnedSites) {
      renderPinnedSites();
    }
  });

  // Settings Logic
  settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

  aiProviderSelect.addEventListener('change', (e) => {
    const newVal = e.target.value;
    currentAiProvider = newVal;
    chrome.storage.local.set({ aiProvider: newVal });
    updateHomeIcon(newVal);
    
    if (homeAiIcon.classList.contains('active')) {
      loadUrl(newVal);
      setActiveIcon(newVal);
    }
  });

  for (const radio of appearanceRadios) {
    radio.addEventListener('change', (e) => {
      chrome.storage.local.set({ appearanceMode: e.target.value });
    });
  }

  // Add/Remove Pin Logic
  addBtn.addEventListener('click', () => {
    pinUrlInput.value = '';
    addModal.classList.remove('hidden');
  });
  
  closeAdd.addEventListener('click', () => addModal.classList.add('hidden'));

  function addPin(url, title = null) {
    try {
      new URL(url);
      if(url.startsWith('chrome://')) { alert("Cannot pin internal Chrome pages."); return; }
      const siteTitle = title || new URL(url).hostname;
      
      chrome.storage.local.get(['pinnedSites'], (result) => {
        let pinnedSites = result.pinnedSites || [];
        if (!pinnedSites.find(s => s.url === url)) {
          pinnedSites.push({ url, title: siteTitle });
          chrome.storage.local.set({ pinnedSites }, () => {
            addModal.classList.add('hidden');
          });
        } else {
          alert("This site is already pinned!");
        }
      });
    } catch (e) {
      alert("Please enter a valid URL including http:// or https://");
    }
  }

  function deletePin(url) {
    chrome.storage.local.get(['pinnedSites'], (result) => {
      let pinnedSites = result.pinnedSites || [];
      pinnedSites = pinnedSites.filter(s => s.url !== url);
      chrome.storage.local.set({ pinnedSites }, () => {
        renderPinnedSites();
        if (iframe.src === url) {
          loadUrl(currentAiProvider);
          setActiveIcon(currentAiProvider);
        }
      });
    });
  }

  addCustomLinkBtn.addEventListener('click', () => addPin(pinUrlInput.value));
  addCurrentTabBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) addPin(tabs[0].url, tabs[0].title);
    });
  });

  // App Bar Actions & Logic
  barSplit.addEventListener('click', () => {
    isSplitView = !isSplitView;
    if (isSplitView) {
      secondaryWorkspace.classList.remove('hidden');
      splitDivider.classList.remove('hidden');
      secondaryFrame.src = currentAiProvider; 
      barSplit.style.color = 'var(--accent-color)';
    } else {
      secondaryWorkspace.classList.add('hidden');
      splitDivider.classList.add('hidden');
      barSplit.style.color = '';
      secondaryFrame.src = 'about:blank'; // free memory
    }
  });

  barMenuTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    barMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    if (!barMenu.classList.contains('hidden')) barMenu.classList.add('hidden');
  });

  barMenu.addEventListener('click', (e) => e.stopPropagation());

  barOpenMain.addEventListener('click', () => {
    chrome.tabs.create({ url: iframe.src });
  });

  menuRefresh.addEventListener('click', () => {
    loadUrl(iframe.src);
    barMenu.classList.add('hidden');
  });

  menuCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(iframe.src).then(() => {
      const originalText = menuCopy.textContent;
      menuCopy.textContent = "Copied!";
      setTimeout(() => { menuCopy.textContent = originalText; barMenu.classList.add('hidden'); }, 1000);
    });
  });

  barMinimize.addEventListener('click', () => {
    loadUrl(currentAiProvider);
    setActiveIcon(currentAiProvider);
  });

  barClose.addEventListener('click', () => {
    // Prompt exactly like the logic above, or just auto-close (delete).
    if (confirm(`Remove this pinned site permanently?`)) {
      deletePin(iframe.src);
    }
  });

  // Dynamic DNR rules for Desktop View Mode
  function updateDesktopModeRulsets(hostname, enable) {
    chrome.declarativeNetRequest.getDynamicRules((rules) => {
      // Find existing rule ID for this hostname if it exists
      const existingRule = rules.find(r => r.condition.urlFilter === `||${hostname}`);
      
      if (enable) {
        if (!existingRule) {
          // Keep dynamic IDs incremental based on timestamp to avoid collisions
          const ruleId = Date.now() % 100000 + 10; 
          chrome.declarativeNetRequest.updateDynamicRules({
            addRules: [{
              id: ruleId,
              priority: 3,
              action: {
                type: "modifyHeaders",
                requestHeaders: [
                  {
                    header: "User-Agent",
                    operation: "set",
                    value: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0"
                  }
                ]
              },
              condition: {
                urlFilter: `||${hostname}`,
                resourceTypes: ["sub_frame"]
              }
            }]
          });
        }
      } else {
        if (existingRule) {
          chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: [existingRule.id]
          });
        }
      }
    });
  }

  menuDesktopBtn.addEventListener('click', () => {
    desktopToggle.checked = !desktopToggle.checked;
    try {
      const hostname = new URL(iframe.src).hostname;
      if (desktopToggle.checked && !desktopSites.includes(hostname)) {
        desktopSites.push(hostname);
      } else if (!desktopToggle.checked && desktopSites.includes(hostname)) {
        desktopSites = desktopSites.filter(h => h !== hostname);
      }
      
      chrome.storage.local.set({ desktopSites }, () => {
        updateDesktopModeRulsets(hostname, desktopToggle.checked);
        // Refresh frame to apply
        loadUrl(iframe.src);
        barMenu.classList.add('hidden');
      });
    } catch {}
  });

  menuTouchBtn.addEventListener('click', () => {
    touchToggle.checked = !touchToggle.checked;
    // Just a placeholder since natively tearing down touch event listeners across an iframe is constrained.
    setTimeout(() => { barMenu.classList.add('hidden'); }, 300);
  });

});
