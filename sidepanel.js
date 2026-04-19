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
  const customAiUrlInput = document.getElementById('custom-ai-url');
  const searchProviderSelect = document.getElementById('search-provider');
  const appearanceRadios = document.getElementsByName('appearanceMode');

  // Welcome / Search Modals
  const welcomeModal = document.getElementById('welcome-modal');
  const welcomeAiProvider = document.getElementById('welcome-ai-provider');
  const welcomeCustomAi = document.getElementById('welcome-custom-ai');
  const welcomeSaveBtn = document.getElementById('welcome-save-btn');
  
  const searchModal = document.getElementById('search-modal');
  const welcomeSearchProvider = document.getElementById('welcome-search-provider');
  const searchSaveBtn = document.getElementById('search-save-btn');
  
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
  const primaryWorkspace = document.getElementById('primary-workspace');
  const secondaryWorkspace = document.getElementById('secondary-workspace');
  const splitDivider = document.getElementById('split-divider');
  const secondaryFrame = document.getElementById('secondary-frame');
  const aiFrame = document.getElementById('ai-frame');

  // Load Initial Settings
  let currentAiProvider = 'https://chatgpt.com/';
  let defaultSearchEngine = '';
  let desktopSites = [];
  let hiddenDefaultApps = [];
  let isSplitView = false;
  
  chrome.storage.local.get(['aiProvider', 'aiProviderHasBeenSet', 'defaultSearchEngine', 'appearanceMode', 'desktopSites', 'hiddenDefaultApps'], (result) => {
    if (!result.aiProviderHasBeenSet) {
      welcomeModal.classList.remove('hidden');
    }

    if (result.aiProvider) {
      currentAiProvider = result.aiProvider;
      
      // Check if it's a known provider or custom
      const options = Array.from(aiProviderSelect.options).map(o => o.value);
      if (!options.includes(currentAiProvider) && currentAiProvider !== 'custom') {
        aiProviderSelect.value = 'custom';
        customAiUrlInput.value = currentAiProvider;
        customAiUrlInput.classList.remove('hidden');
      } else {
        aiProviderSelect.value = currentAiProvider;
      }
    }

    if (result.defaultSearchEngine) {
      defaultSearchEngine = result.defaultSearchEngine;
      searchProviderSelect.value = defaultSearchEngine;
      // Update search icon URL
      const searchIcon = document.getElementById('search-icon');
      if (searchIcon) searchIcon.dataset.url = defaultSearchEngine;
    }
    
    if (result.appearanceMode) {
      for (const radio of appearanceRadios) {
        if (radio.value === result.appearanceMode) radio.checked = true;
      }
    }

    if (result.desktopSites) {
      desktopSites = result.desktopSites;
    }

    if (result.hiddenDefaultApps) {
      hiddenDefaultApps = result.hiddenDefaultApps;
      hiddenDefaultApps.forEach(appId => {
        const el = document.getElementById(appId);
        if (el) el.style.display = 'none';
      });
    }

    updateHomeIcon(currentAiProvider);
    // Pre-load the AI iframe immediately so it's ready before user clicks
    aiFrame.src = currentAiProvider;
    // Main frame stays blank (hidden behind ai-frame until user picks another app)
    iframe.src = 'about:blank';
    // Show AI frame by default
    aiFrame.style.zIndex = '2';
    iframe.style.zIndex = '1';
    setActiveIcon(currentAiProvider);
  });

  // Default App Visibility Toggle Logic
  window.toggleDefaultAppVisibility = function(appId, show) {
    const el = document.getElementById(appId);
    if (!el) return;
    
    if (show) {
      el.style.display = 'flex';
      hiddenDefaultApps = hiddenDefaultApps.filter(id => id !== appId);
    } else {
      el.style.display = 'none';
      if (!hiddenDefaultApps.includes(appId)) hiddenDefaultApps.push(appId);
    }
    
    chrome.storage.local.set({ hiddenDefaultApps });
    
    // Update settings checkbox if it exists
    const cb = document.getElementById(`toggle-${appId}`);
    if (cb) cb.checked = show;
  };

  // Basic frame loading handling
  iframe.addEventListener('load', () => {
    loading.classList.add('hidden');
  });

  function loadUrl(url) {
    // If loading the AI provider, just bring the ai-frame to front (no reload)
    if (url === currentAiProvider) {
      aiFrame.style.zIndex = '2';
      iframe.style.zIndex = '1';
      return;
    }
    // Otherwise show the main frame on top
    aiFrame.style.zIndex = '1';
    iframe.style.zIndex = '2';
    loading.classList.remove('hidden');
    if (url.startsWith('local:')) {
      iframe.src = chrome.runtime.getURL(url.replace('local:', ''));
    } else {
      iframe.src = url;
    }
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
    if (url.startsWith('local:')) {
      const page = url.replace('local:', '').replace('.html', '');
      return page.charAt(0).toUpperCase() + page.slice(1);
    }
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
      // Bring AI frame to front
      aiFrame.style.zIndex = '2';
      iframe.style.zIndex = '1';
      
      // Auto-collapse split view when dropping back to Home AI to prevent duplicates
      if (isSplitView) {
        isSplitView = false;
        secondaryWorkspace.classList.add('hidden');
        splitDivider.classList.add('hidden');
        barSplit.style.color = '';
        primaryWorkspace.style.flex = '';
      }
    } else {
      appBar.classList.remove('hidden');
      appTitle.textContent = getSiteTitle(url);
      appUrl.textContent = url.startsWith('local:') ? 'Extension App' : url;
      
      // Update toggles based on settings
      try {
        if (!url.startsWith('local:')) {
          const hostname = new URL(url).hostname;
          desktopToggle.checked = desktopSites.includes(hostname);
        }
      } catch {}
    }
  }

  function bindIconEvents() {
    document.querySelectorAll('.app-icon').forEach(icon => {
      icon.onclick = (e) => {
        let targetUrl = icon.dataset.url;
        
        // Special case for Search
        if (icon.id === 'search-icon') {
          if (!defaultSearchEngine) {
            searchModal.classList.remove('hidden');
            return;
          }
          targetUrl = defaultSearchEngine;
        }

        setActiveIcon(targetUrl);
        loadUrl(targetUrl);
      };
      
      icon.oncontextmenu = (e) => {
        e.preventDefault();
        const targetUrl = icon.dataset.url;
        
        if (icon.classList.contains('default-app') || icon.id === 'home-ai-icon') {
          if (confirm(`Hide ${icon.title || 'this app'} from sidebar? You can re-enable it in Settings.`)) {
            window.toggleDefaultAppVisibility(icon.id, false);
          }
          return;
        }
        
        if (confirm(`Remove this pinned site?`)) {
          deletePin(targetUrl);
        }
      };
    });
  }

  function renderPinnedSites() {
    chrome.storage.local.get(['pinnedSites'], (result) => {
      let sites = result.pinnedSites;
      if (!sites) {
        sites = [
          { url: 'https://translate.google.com/', title: 'Google Translate' },
          { url: 'https://claude.ai/', title: 'Claude' },
          { url: 'https://gemini.google.com/', title: 'Gemini' }
        ];
        chrome.storage.local.set({ pinnedSites: sites });
      }
      
      pinnedContainer.innerHTML = '';
      sites.forEach((site, index) => {
        const div = document.createElement('div');
        div.className = 'app-icon';
        div.dataset.url = site.url;
        div.dataset.index = index;
        div.title = site.title;
        div.draggable = true;
        
        const img = document.createElement('img');
        img.src = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`;
        
        div.appendChild(img);
        pinnedContainer.appendChild(div);
      });
      bindIconEvents();
      bindDragEvents();
      setActiveIcon(iframe.src);
    });
  }

  function bindDragEvents() {
    const icons = pinnedContainer.querySelectorAll('.app-icon');
    icons.forEach(icon => {
      icon.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', icon.dataset.index);
        icon.classList.add('dragging');
      });
      
      icon.addEventListener('dragend', () => {
        icon.classList.remove('dragging');
        document.querySelectorAll('.app-icon').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
      });
      
      icon.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        const rect = icon.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
          icon.classList.add('drag-over-top');
          icon.classList.remove('drag-over-bottom');
        } else {
          icon.classList.add('drag-over-bottom');
          icon.classList.remove('drag-over-top');
        }
      });
      
      icon.addEventListener('dragleave', () => {
        icon.classList.remove('drag-over-top', 'drag-over-bottom');
      });
      
      icon.addEventListener('drop', (e) => {
        e.preventDefault();
        icon.classList.remove('drag-over-top', 'drag-over-bottom');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIndex = parseInt(icon.dataset.index, 10);
        
        if (fromIndex === toIndex || isNaN(fromIndex)) return;
        
        const rect = icon.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let insertIndex = toIndex;
        if (e.clientY >= midY) {
          insertIndex++;
        }
        
        if (fromIndex < insertIndex) {
          insertIndex--;
        }

        reorderPinnedSites(fromIndex, insertIndex);
      });
    });
  }

  function reorderPinnedSites(fromIndex, toIndex) {
    chrome.storage.local.get(['pinnedSites'], (result) => {
      let sites = result.pinnedSites || [];
      const [movedSite] = sites.splice(fromIndex, 1);
      sites.splice(toIndex, 0, movedSite);
      chrome.storage.local.set({ pinnedSites: sites });
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

  function handleAiProviderChange(newVal) {
    currentAiProvider = newVal;
    chrome.storage.local.set({ aiProvider: newVal, aiProviderHasBeenSet: true });
    updateHomeIcon(newVal);
    // Always keep the AI frame warm with the new provider
    aiFrame.src = newVal;
    aiFrame.style.zIndex = '2';
    iframe.style.zIndex = '1';
    setActiveIcon(newVal);
  }

  aiProviderSelect.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      customAiUrlInput.classList.remove('hidden');
    } else {
      customAiUrlInput.classList.add('hidden');
      handleAiProviderChange(e.target.value);
    }
  });

  customAiUrlInput.addEventListener('change', (e) => {
    const val = e.target.value.trim();
    if (val && (val.startsWith('http://') || val.startsWith('https://'))) {
      handleAiProviderChange(val);
    } else if (val) {
      handleAiProviderChange('https://' + val);
    }
  });

  searchProviderSelect.addEventListener('change', (e) => {
    defaultSearchEngine = e.target.value;
    chrome.storage.local.set({ defaultSearchEngine });
    const searchIcon = document.getElementById('search-icon');
    if (searchIcon) searchIcon.dataset.url = defaultSearchEngine;
  });

  for (const radio of appearanceRadios) {
    radio.addEventListener('change', (e) => {
      chrome.storage.local.set({ appearanceMode: e.target.value });
    });
  }

  // App visibility checkboxes
  ['search-icon', 'drop-icon', 'tools-icon'].forEach(appId => {
    const cb = document.getElementById(`toggle-${appId}`);
    if (cb) {
      cb.addEventListener('change', (e) => {
        window.toggleDefaultAppVisibility(appId, e.target.checked);
      });
    }
  });

  // Welcome Modals Logic
  welcomeAiProvider.addEventListener('change', (e) => {
    if (e.target.value === 'custom') {
      welcomeCustomAi.classList.remove('hidden');
    } else {
      welcomeCustomAi.classList.add('hidden');
    }
  });

  welcomeSaveBtn.addEventListener('click', () => {
    let val = welcomeAiProvider.value;
    if (val === 'custom') {
      val = welcomeCustomAi.value.trim();
      if (val && !val.startsWith('http')) val = 'https://' + val;
      if (!val) val = 'https://chatgpt.com/'; // fallback
    }
    
    handleAiProviderChange(val);
    welcomeModal.classList.add('hidden');
  });

  searchSaveBtn.addEventListener('click', () => {
    defaultSearchEngine = welcomeSearchProvider.value;
    chrome.storage.local.set({ defaultSearchEngine });
    const searchIcon = document.getElementById('search-icon');
    if (searchIcon) searchIcon.dataset.url = defaultSearchEngine;
    
    searchModal.classList.add('hidden');
    
    // Auto load it
    setActiveIcon(defaultSearchEngine);
    loadUrl(defaultSearchEngine);
  });

  // Add/Remove Pin Logic
  addBtn.addEventListener('click', () => {
    pinUrlInput.value = '';
    addModal.classList.remove('hidden');
  });
  
  closeAdd.addEventListener('click', () => addModal.classList.add('hidden'));

  function addPin(url, title = null) {
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }
    
    try {
      new URL(finalUrl);
      if(finalUrl.startsWith('chrome://')) { alert("Cannot pin internal Chrome pages."); return; }
      const siteTitle = title || new URL(finalUrl).hostname;
      
      chrome.storage.local.get(['pinnedSites'], (result) => {
        let pinnedSites = result.pinnedSites || [];
        if (!pinnedSites.find(s => s.url === finalUrl)) {
          pinnedSites.push({ url: finalUrl, title: siteTitle });
          chrome.storage.local.set({ pinnedSites }, () => {
            addModal.classList.add('hidden');
          });
        } else {
          alert("This site is already pinned!");
        }
      });
    } catch (e) {
      alert("Please enter a valid URL.");
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
      // Reset flex sizes
      primaryWorkspace.style.flex = '';
      secondaryWorkspace.style.flex = '';
    } else {
      secondaryWorkspace.classList.add('hidden');
      splitDivider.classList.add('hidden');
      barSplit.style.color = '';
      secondaryFrame.src = 'about:blank'; // free memory
      primaryWorkspace.style.flex = '';
    }
  });

  // Split Screen Resizing Logic
  let isDraggingSplit = false;

  splitDivider.addEventListener('mousedown', (e) => {
    isDraggingSplit = true;
    document.body.style.cursor = 'ns-resize';
    primaryWorkspace.style.pointerEvents = 'none';
    secondaryWorkspace.style.pointerEvents = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingSplit) return;
    
    const containerHeight = document.querySelector('.content-area').getBoundingClientRect().height;
    const appBarHeight = appBar.classList.contains('hidden') ? 0 : appBar.getBoundingClientRect().height;
    
    let newHeight = e.clientY - appBarHeight;
    
    // Bounds checking
    if (newHeight < 100) newHeight = 100;
    if (newHeight > containerHeight - 100) newHeight = containerHeight - 100;
    
    primaryWorkspace.style.flex = `0 0 ${newHeight}px`;
    secondaryWorkspace.style.flex = `1 1 0%`;
  });

  document.addEventListener('mouseup', () => {
    if (isDraggingSplit) {
      isDraggingSplit = false;
      document.body.style.cursor = '';
      primaryWorkspace.style.pointerEvents = '';
      secondaryWorkspace.style.pointerEvents = '';
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

  // Badge API
  window.setBadge = function(url, show) {
    const icon = document.querySelector(`.app-icon[data-url="${url}"]`);
    if (icon) {
      if (show) {
        icon.classList.add('has-badge');
      } else {
        icon.classList.remove('has-badge');
      }
    }
  };

});
