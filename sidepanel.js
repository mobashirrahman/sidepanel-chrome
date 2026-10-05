document.addEventListener('DOMContentLoaded', () => {
  const iframe = document.getElementById('main-frame');
  const loading = document.getElementById('loading');
  const pinnedContainer = document.getElementById('pinned-sites-container');
  const contentArea = document.querySelector('.content-area');
  
  // Modals
  const settingsModal = document.getElementById('settings-modal');
  const settingsBtn = document.getElementById('settings-btn');
  const closeSettings = document.getElementById('close-settings');
  
  const addBtn = document.getElementById('add-btn');
  const pinPicker = document.getElementById('pin-picker');
  const closePinPicker = document.getElementById('close-pin-picker');
  const pinPickerSearch = document.getElementById('pin-picker-search');
  
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
  const appGlyph = document.getElementById('app-glyph');
  const appTitle = document.getElementById('app-title');
  const appUrl = document.getElementById('app-url');
  const barSplit = document.getElementById('bar-split');
  const barOpenMain = document.getElementById('bar-open-main');
  const barMenuTrigger = document.getElementById('bar-menu-trigger');
  const barMenu = document.getElementById('bar-menu');
  const menuRefresh = document.getElementById('menu-refresh');
  const menuCopy = document.getElementById('menu-copy');
  const menuSummarize = document.getElementById('menu-summarize');
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

  // A missing favicon must not leave a broken-image glyph in the header
  if (appGlyph) {
    appGlyph.addEventListener('error', () => { appGlyph.style.visibility = 'hidden'; });
  }

  // Load Initial Settings
  let currentAiProvider = 'https://chatgpt.com/';
  let currentViewUrl = 'https://chatgpt.com/'; // tracks the currently visible URL
  let defaultSearchEngine = '';
  let desktopSites = [];
  let hiddenDefaultApps = [];
  let isSplitView = false;

  // Scope the framing-header rules to the frames this panel creates.
  // Fallbacks cover first run, before the welcome flow stores anything.
  globalThis.SidekickFrameRules?.install({
    aiProvider: currentAiProvider,
    defaultSearchEngine,
  });

  // Migrate legacy pinnedSites into a workspace (or adopt newer synced state)
  // before the first rail render below.
  globalThis.SidekickWorkspaces?.ensureState(() => {});
  
  chrome.storage.local.get(['aiProvider', 'aiProviderHasBeenSet', 'defaultSearchEngine', 'appearanceMode', 'desktopSites', 'hiddenDefaultApps'], (result) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading settings:', chrome.runtime.lastError);
      return;
    }

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
      // Drop ids whose icons no longer exist so storage doesn't grow stale entries
      const live = result.hiddenDefaultApps.filter(appId => document.getElementById(appId));
      if (live.length !== result.hiddenDefaultApps.length) {
        chrome.storage.local.set({ hiddenDefaultApps: live });
      }
      hiddenDefaultApps = live;
      hiddenDefaultApps.forEach(appId => {
        document.getElementById(appId).style.display = 'none';
      });
    }

    updateHomeIcon(currentAiProvider);
    // Pre-load the AI iframe immediately so it's ready before user clicks
    aiFrame.src = currentAiProvider;
    currentViewUrl = currentAiProvider;
    // Show AI frame by default
    aiFrame.style.zIndex = '2';
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

  // LRU iframe cache pool — preserves the last 2 visited pinned sites.
  // Each entry is a full cross-origin site in its own renderer process, so this
  // number is the main RAM dial. Raise it only if in-page state matters more.
  const CACHE_LIMIT = 2;
  const iframeCache = new Map(); // url -> iframe element (ordered by recency)
  const iframeContainer = document.querySelector('.iframe-container');

  // Hosts where tearing down the frame kills background audio/video. Eviction
  // prefers the oldest non-media frame so e.g. YouTube keeps playing while the
  // user flips through other pins. Only when every cached frame is media does
  // it fall back to plain LRU.
  const MEDIA_HOSTS = [
    'youtube.com',
    'youtu.be',
    'music.youtube.com',
    'open.spotify.com',
    'soundcloud.com',
    'twitch.tv',
    'netflix.com',
  ];

  function isMediaUrl(url) {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return MEDIA_HOSTS.some((h) => host === h || host.endsWith('.' + h));
    } catch {
      return false;
    }
  }

  // Exposed for tests; the hostname check must not match lookalikes.
  window.SidekickMedia = { isMediaUrl };

  function getOrCreateCachedFrame(url) {
    if (iframeCache.has(url)) {
      // Move to end (most recently used)
      const frame = iframeCache.get(url);
      iframeCache.delete(url);
      iframeCache.set(url, frame);
      return { frame, isNew: false };
    }

    // Evict least recently used if at limit, sparing media first so
    // background playback survives site switches.
    if (iframeCache.size >= CACHE_LIMIT) {
      let evictUrl = null;
      for (const cachedUrl of iframeCache.keys()) {
        if (!isMediaUrl(cachedUrl)) {
          evictUrl = cachedUrl;
          break;
        }
      }
      if (!evictUrl) evictUrl = iframeCache.keys().next().value;
      const oldestFrame = iframeCache.get(evictUrl);
      oldestFrame.remove();
      iframeCache.delete(evictUrl);
    }

    // Create a new cached iframe
    // Sandbox everything except top navigation: a framed site (e.g. a bot
    // challenge page) must never be able to navigate the panel itself away.
    // All other capabilities are preserved so embedded apps keep working.
    const frame = document.createElement('iframe');
    frame.frameBorder = '0';
    frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-read; clipboard-write; microphone; camera;';
    frame.setAttribute('sandbox', [
      'allow-scripts',
      'allow-same-origin',
      'allow-forms',
      'allow-modals',
      'allow-popups',
      'allow-popups-to-escape-sandbox',
      'allow-downloads',
      'allow-pointer-lock',
      'allow-orientation-lock',
      'allow-presentation',
    ].join(' '));
    frame.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:1;';
    frame.addEventListener('load', () => loading.classList.add('hidden'));
    iframeContainer.appendChild(frame);
    iframeCache.set(url, frame);
    return { frame, isNew: true };
  }

  function hideAllCachedFrames() {
    iframeCache.forEach(frame => { frame.style.zIndex = '1'; });
  }

  // Instagram's client app fails its initial route resolution inside cross-site
  // embeds and parks on its error route, but a subsequent same-document
  // navigation re-invokes the client router, which then resolves home
  // correctly. Verified end to end: hard load lands on "Page not found", then
  // a fragment step (no document reload) fetches PolarisHomeRoot and renders
  // home; pinning the fragment directly does not work, it must arrive second.
  const IG_NUDGE_DELAY_MS = 4000;
  const IG_NUDGE_FRAGMENT = '#sidekick-home';

  function isInstagramUrl(url) {
    try {
      const host = new URL(url).hostname;
      return host === 'instagram.com' || host.endsWith('.instagram.com');
    } catch {
      return false;
    }
  }

  // Exposed for tests; the hostname check must not match lookalikes.
  window.SidekickInstagramNudge = { isInstagramUrl };

  function scheduleInstagramNudge(frame) {
    frame.addEventListener('load', () => {
      setTimeout(() => {
        try {
          // Same-document navigation only: no document reload, so this can
          // only wake the client router, never restart the boot that failed.
          // Bail if anything already moved the frame along.
          const current = new URL(frame.src);
          if (current.hash) return;
          frame.src = current.toString() + IG_NUDGE_FRAGMENT;
        } catch {}
      }, IG_NUDGE_DELAY_MS);
    }, { once: true });
  }

  function loadUrl(url) {
    currentViewUrl = url;
    // If loading the AI provider, just bring the ai-frame to front (no reload)
    if (url === currentAiProvider) {
      hideAllCachedFrames();
      aiFrame.style.zIndex = '2';
      return;
    }

    // Push AI frame to back
    aiFrame.style.zIndex = '1';

    // Use LRU cache for regular pinned sites
    hideAllCachedFrames();
    const { frame, isNew } = getOrCreateCachedFrame(url);
    if (isNew) {
      loading.classList.remove('hidden');
      frame.src = url;
      // Fresh Instagram frames need the post-boot nudge (see above). Cached
      // frames are deliberately left alone: the user may have navigated in-app
      // and must not be yanked back home.
      if (isInstagramUrl(url)) scheduleInstagramNudge(frame);
    }
    frame.style.zIndex = '2';
  }

  function updateHomeIcon(url) {
    homeAiIcon.dataset.url = url;
    try {
      const hostname = new URL(url).hostname;
      homeAiIcon.dataset.tip = hostname;
      homeAiIcon.setAttribute('aria-label', hostname);
    } catch {}

    if (url === 'https://copilot.microsoft.com/') {
      homeAiSvg.style.display = 'block';
      homeAiImg.style.display = 'none';
      homeAiImg.src = '';
    } else {
      homeAiSvg.style.display = 'none';
      homeAiImg.style.display = 'block';
      homeAiImg.src = faviconUrl(url);
    }
  }

  function getSiteTitle(url) {
    // try to find title from pinned list
    const el = document.querySelector(`.app-icon[data-url="${url}"]`);
    if (el && el.dataset.tip) return el.dataset.tip;
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
      appUrl.textContent = url;
      // Glyph shows the site's real favicon so the header reads at a glance
      appGlyph.style.visibility = 'visible';
      appGlyph.src = faviconUrl(url);

      // Update toggles based on settings
      try {
        const hostname = new URL(url).hostname;
        desktopToggle.checked = desktopSites.includes(hostname);
      } catch {}
    }
  }

  // Keyboard-shortcut navigation (manifest commands -> background -> here).
  // Cycles the rail in DOM order, skipping the search icon when no engine is
  // configured since that would only open the setup modal.
  function cyclePin(direction) {
    const icons = Array.from(document.querySelectorAll('.nav-top .app-icon'));
    if (!icons.length) return;
    let idx = icons.findIndex((el) => el.dataset.url && el.dataset.url === currentViewUrl);
    for (let step = 0; step < icons.length; step++) {
      idx = (idx + direction + icons.length) % icons.length;
      const el = icons[idx];
      if (el.id === 'search-icon' && !defaultSearchEngine) continue;
      el.click();
      return;
    }
  }

  function dispatchPanelCommand(msg) {
    if (!msg) return;
    if (msg.type === 'sidekick-cycle') {
      cyclePin(msg.direction || 1);
    } else if (msg.type === 'sidekick-home') {
      setActiveIcon(currentAiProvider);
      loadUrl(currentAiProvider);
    }
  }

  chrome.runtime.onMessage.addListener((msg) => dispatchPanelCommand(msg));

  // A shortcut fired while the panel was closed has no live receiver, so the
  // background stashes it. Drain it once the rail is bound (guarded: later
  // renders are signature-skipped anyway, but the flag makes it explicit).
  let panelCommandDrained = false;
  function drainPendingPanelCommand() {
    if (panelCommandDrained) return;
    panelCommandDrained = true;
    chrome.storage.local.get(['pendingPanelCommand'], (result) => {
      if (chrome.runtime.lastError) return;
      const cmd = result.pendingPanelCommand;
      if (!cmd) return;
      chrome.storage.local.remove('pendingPanelCommand');
      dispatchPanelCommand(cmd);
    });
  }

  // In-panel confirm. Native confirm() is not wired up in every host's side
  // panel surface, where it silently returns false and the action just dies.
  const confirmModal = document.getElementById('confirm-modal');
  const confirmMessage = document.getElementById('confirm-message');
  const confirmOk = document.getElementById('confirm-ok');
  const confirmCancel = document.getElementById('confirm-cancel');
  let confirmResolve = null;

  function showConfirm(message, okLabel = 'Remove') {
    return new Promise((resolve) => {
      confirmResolve?.(false); // settle any stale prompt
      confirmResolve = resolve;
      confirmMessage.textContent = message;
      confirmOk.textContent = okLabel;
      confirmModal.classList.remove('hidden');
    });
  }

  function settleConfirm(value) {
    if (!confirmResolve) return;
    const resolve = confirmResolve;
    confirmResolve = null;
    confirmModal.classList.add('hidden');
    resolve(value);
  }

  confirmOk.addEventListener('click', () => settleConfirm(true));
  confirmCancel.addEventListener('click', () => settleConfirm(false));
  confirmModal.addEventListener('click', (e) => {
    if (e.target === confirmModal) settleConfirm(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !confirmModal.classList.contains('hidden')) {
      settleConfirm(false);
    }
  });

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
      
      icon.oncontextmenu = async (e) => {
        e.preventDefault();
        const targetUrl = icon.dataset.url;

        if (icon.classList.contains('default-app') || icon.id === 'home-ai-icon') {
          const hide = await showConfirm(
            `Hide ${icon.dataset.tip || icon.getAttribute('aria-label') || 'this app'} from sidebar? You can re-enable it in Settings.`,
            'Hide'
          );
          if (hide) window.toggleDefaultAppVisibility(icon.id, false);
          return;
        }

        if (await showConfirm('Remove this pinned site?')) {
          deletePin(targetUrl);
        }
      };
    });
  }

  let lastRenderedPinnedSignature = null;

  function renderPinnedSites() {
    chrome.storage.local.get(['pinnedSites'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error loading pinned sites:', chrome.runtime.lastError);
        return;
      }

      let sites = result.pinnedSites;
      if (!sites) {
        // translate.google.com serves a hard 403 to cross-site embeds and
        // claude.ai answers with a Cloudflare bot challenge, so neither can be
        // a working default pin. These three were verified to embed cleanly.
        sites = [
          { url: 'https://gemini.google.com/', title: 'Gemini' },
          { url: 'https://www.bing.com/translator', title: 'Bing Translator' },
          { url: 'https://github.com/', title: 'GitHub' }
        ];
        chrome.storage.local.set({ pinnedSites: sites }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving pinned sites:', chrome.runtime.lastError);
          }
        });
      }

      // Every write to pinnedSites fires onChanged, and most callers also render
      // explicitly, so without this guard the strip is torn down and rebuilt
      // several times per interaction.
      const signature = JSON.stringify(sites);
      if (signature === lastRenderedPinnedSignature) return;
      lastRenderedPinnedSignature = signature;

      pinnedContainer.innerHTML = '';
      sites.forEach((site, index) => {
        const div = document.createElement('div');
        div.className = 'app-icon';
        div.dataset.url = site.url;
        div.dataset.index = index;
        div.dataset.tip = site.title;
        div.setAttribute('aria-label', site.title);
        div.draggable = true;

        const img = document.createElement('img');
        img.src = faviconUrl(site.url);
        img.alt = '';

        div.appendChild(img);
        pinnedContainer.appendChild(div);
      });
      bindIconEvents();
      bindDragEvents();
      setActiveIcon(currentViewUrl);
      drainPendingPanelCommand();
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
      if (chrome.runtime.lastError) {
        console.error('Error reading pinned sites:', chrome.runtime.lastError);
        return;
      }

      const sites = (result.pinnedSites || []).slice();
      const [movedSite] = sites.splice(fromIndex, 1);
      if (!movedSite) return;
      sites.splice(toIndex, 0, movedSite);
      globalThis.SidekickWorkspaces.setActiveSites(sites, () => {
        if (chrome.runtime.lastError) {
          console.error('Error reordering pinned sites:', chrome.runtime.lastError);
        }
      });
    });
  }

  chrome.storage.local.get(['pinnedSites'], (result) => {
    if (!chrome.runtime.lastError) refreshPinnedUrlSet(result.pinnedSites);
  });

  // Handoff that landed while the panel was closed (background opened us).
  chrome.storage.local.get(['aiHandoff'], (result) => {
    if (!chrome.runtime.lastError && result.aiHandoff) consumeAiHandoff(result.aiHandoff);
  });

  setTimeout(() => renderPinnedSites(), 100);

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.pinnedSites) {
      refreshPinnedUrlSet(changes.pinnedSites.newValue);
      renderPinnedSites();
      refreshPinPickerState();
    }
    // Another device (or this panel) touched workspaces: keep the Settings
    // select truthful. Pinned-site changes already re-render above.
    if (namespace === 'local' && globalThis.SidekickWorkspaces.WS_KEYS.some((k) => changes[k])) {
      refreshWorkspaceSelect();
    }
    // Context-menu handoff from the background while the panel is open.
    if (namespace === 'local' && changes.aiHandoff && changes.aiHandoff.newValue) {
      consumeAiHandoff(changes.aiHandoff.newValue);
    }
  });

  // Shared rail tooltip. It renders at strip level (not inside the button)
  // because the pinned-sites container scrolls and would clip a CSS-only tip.
  // Text comes from data-tip so dynamic icons need no extra DOM.
  const navStrip = document.querySelector('.nav-strip');
  const railTip = document.getElementById('rail-tip');
  let railTipTimer = null;

  function hideRailTip() {
    if (railTipTimer) {
      clearTimeout(railTipTimer);
      railTipTimer = null;
    }
    if (railTip) railTip.classList.add('hidden');
  }

  if (navStrip && railTip) {
    navStrip.addEventListener('mouseover', (e) => {
      const btn = e.target.closest('.app-icon, .action-icon');
      const label = btn && (btn.dataset.tip || btn.getAttribute('aria-label'));
      if (!label) {
        hideRailTip();
        return;
      }
      if (railTipTimer) clearTimeout(railTipTimer);
      railTipTimer = setTimeout(() => {
        railTipTimer = null;
        const stripRect = navStrip.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        railTip.textContent = label;
        railTip.style.top = `${btnRect.top + btnRect.height / 2 - stripRect.top}px`;
        railTip.classList.remove('hidden');
      }, 350);
    });

    navStrip.addEventListener('mouseout', (e) => {
      const from = e.target.closest('.app-icon, .action-icon');
      const to = e.relatedTarget && e.relatedTarget.closest
        ? e.relatedTarget.closest('.app-icon, .action-icon')
        : null;
      if (from && from !== to) hideRailTip();
    });

    // Scrolling or clicking invalidates the anchor position
    pinnedContainer.addEventListener('scroll', hideRailTip, { passive: true });
    navStrip.addEventListener('click', hideRailTip);
  }

  // Settings Logic
  settingsBtn.addEventListener('click', () => settingsModal.classList.remove('hidden'));
  closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

  function handleAiProviderChange(newVal) {
    currentAiProvider = newVal;
    chrome.storage.local.set({ aiProvider: newVal, aiProviderHasBeenSet: true }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving AI provider:', chrome.runtime.lastError);
      }
    });
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
    chrome.storage.local.set({ defaultSearchEngine }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error saving search provider:', chrome.runtime.lastError);
      }
    });
    const searchIcon = document.getElementById('search-icon');
    if (searchIcon) searchIcon.dataset.url = defaultSearchEngine;
  });

  for (const radio of appearanceRadios) {
    radio.addEventListener('change', (e) => {
      chrome.storage.local.set({ appearanceMode: e.target.value }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving appearance mode:', chrome.runtime.lastError);
        }
      });
    });
  }

  // App visibility checkboxes
  ['search-icon'].forEach(appId => {
    const cb = document.getElementById(`toggle-${appId}`);
    if (cb) {
      cb.addEventListener('change', (e) => {
        window.toggleDefaultAppVisibility(appId, e.target.checked);
      });
    }
  });

  // Workspaces UI (Settings modal). The rail always renders pinnedSites, so
  // switching workspaces only needs to swap the mirror; the storage listener
  // above re-renders.
  const workspaceSelect = document.getElementById('workspace-select');
  const workspaceNameInput = document.getElementById('workspace-name');

  function refreshWorkspaceSelect() {
    if (!workspaceSelect) return;
    globalThis.SidekickWorkspaces.ensureState((state) => {
      workspaceSelect.innerHTML = '';
      state.workspaces.forEach((ws) => {
        const count = (state.workspaceSites[ws.id] || []).length;
        const opt = document.createElement('option');
        opt.value = ws.id;
        opt.textContent = `${ws.name} (${count})`;
        workspaceSelect.appendChild(opt);
      });
      workspaceSelect.value = state.activeWorkspaceId;
    });
  }

  if (workspaceSelect) {
    refreshWorkspaceSelect();
    settingsBtn.addEventListener('click', refreshWorkspaceSelect);

    workspaceSelect.addEventListener('change', () => {
      globalThis.SidekickWorkspaces.switchWorkspace(workspaceSelect.value, () => {
        refreshWorkspaceSelect();
      });
    });

    document.getElementById('workspace-add').addEventListener('click', () => {
      const name = workspaceNameInput.value.trim();
      globalThis.SidekickWorkspaces.createWorkspace(name, () => {
        workspaceNameInput.value = '';
        refreshWorkspaceSelect();
      });
    });

    document.getElementById('workspace-rename').addEventListener('click', () => {
      const name = workspaceNameInput.value.trim();
      if (!name) return;
      globalThis.SidekickWorkspaces.renameWorkspace(workspaceSelect.value, name, () => {
        workspaceNameInput.value = '';
        refreshWorkspaceSelect();
      });
    });

    document.getElementById('workspace-delete').addEventListener('click', async () => {
      const label = workspaceSelect.selectedOptions[0]?.textContent || 'this workspace';
      if (await showConfirm(`Delete ${label}? Its pins will be removed from this device.`)) {
        globalThis.SidekickWorkspaces.deleteWorkspace(workspaceSelect.value, () => {
          refreshWorkspaceSelect();
        });
      }
    });
  }

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
  addBtn.addEventListener('click', () => openPinPicker());
  closePinPicker.addEventListener('click', () => pinPicker.classList.add('hidden'));

  function addPin(url, title = null, closeAfter = true) {
    let finalUrl = url.trim();
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
      finalUrl = 'https://' + finalUrl;
    }

    try {
      new URL(finalUrl);
      if(finalUrl.startsWith('chrome://')) { alert("Cannot pin internal Chrome pages."); return; }
      const siteTitle = title || new URL(finalUrl).hostname;

      // Pins live in the active workspace; pinnedSites is mirrored by the
      // workspaces module so the rail, frame rules and picker stay in sync.
      globalThis.SidekickWorkspaces.addPin(finalUrl, siteTitle, (state, added) => {
        if (chrome.runtime.lastError) {
          console.error('Error saving pinned site:', chrome.runtime.lastError);
          return;
        }
        if (!added) {
          if (closeAfter) alert("This site is already pinned!");
          return;
        }
        if (closeAfter) pinPicker.classList.add('hidden');
        refreshPinPickerState();
      });
    } catch (e) {
      alert("Please enter a valid URL.");
    }
  }

  function deletePin(url) {
    // Mutations derive from raw pinnedSites (the rail's render source) and
    // write back through the active workspace, so a direct external write is
    // respected instead of being clobbered by a stale workspace mirror.
    chrome.storage.local.get(['pinnedSites'], (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error reading pinned sites:', chrome.runtime.lastError);
        return;
      }

      const sites = (result.pinnedSites || []).filter(s => s.url !== url);
      globalThis.SidekickWorkspaces.setActiveSites(sites, () => {
        if (chrome.runtime.lastError) {
          console.error('Error deleting pinned site:', chrome.runtime.lastError);
          return;
        }
        renderPinnedSites();
        if (currentViewUrl === url) {
          loadUrl(currentAiProvider);
          setActiveIcon(currentAiProvider);
        }
      });
    });
  }

  addCustomLinkBtn.addEventListener('click', () => {
    if (pinUrlInput.value.trim()) addPin(pinUrlInput.value);
  });
  pinUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && pinUrlInput.value.trim()) addPin(pinUrlInput.value);
  });
  addCurrentTabBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        addPin(tabs[0].url, tabs[0].title);
      }
    });
  });

  // ============================================================
  // Pin Picker - Curated Sites Data & Logic
  // ============================================================
  const CURATED_SITES = [
    // Quick Access (also appears in discover)
    { name: 'ChatGPT',         url: 'https://chatgpt.com/',              cat: 'ai',          desc: 'Leading AI chat assistant',           quickAccess: true },
    { name: 'Google',          url: 'https://www.google.com/',           cat: 'tools',       desc: 'Search the web',                       quickAccess: true },
    { name: 'Facebook',        url: 'https://www.facebook.com/',         cat: 'social',      desc: 'Connect with friends and family',       quickAccess: true },
    { name: 'DeepL',           url: 'https://www.deepl.com/',            cat: 'tools',       desc: 'Accurate AI-powered translations',      quickAccess: true },
    // Discover list
    { name: 'Claude',          url: 'https://claude.ai/',                cat: 'ai',          desc: 'AI assistant by Anthropic' },
    { name: 'Gemini',          url: 'https://gemini.google.com/',        cat: 'ai',          desc: 'AI assistant by Google' },
    { name: 'Perplexity',      url: 'https://www.perplexity.ai/',        cat: 'ai',          desc: 'AI-powered search engine' },
    { name: 'DeepSeek',        url: 'https://chat.deepseek.com/',        cat: 'ai',          desc: 'Open-source AI assistant' },
    { name: 'Grok',            url: 'https://grok.com/',                 cat: 'ai',          desc: 'AI assistant by xAI' },
    { name: 'Mistral',         url: 'https://chat.mistral.ai/',          cat: 'ai',          desc: 'Mistral AI chat assistant' },
    { name: 'Meta AI',         url: 'https://www.meta.ai/',              cat: 'ai',          desc: 'Meta AI assistant' },
    { name: 'HuggingChat',     url: 'https://huggingface.co/chat/',      cat: 'ai',          desc: 'Open-source AI chat' },
    { name: 'Duck.ai',         url: 'https://duck.ai/',                  cat: 'ai',          desc: 'Private AI chat by DuckDuckGo' },
    { name: 'Poe',             url: 'https://poe.com/',                  cat: 'ai',          desc: 'Multi-model AI chat' },
    { name: 'Qwen',            url: 'https://chat.qwen.ai/',           cat: 'ai',          desc: 'Qwen AI chat assistant' },
    { name: 'Instagram',       url: 'https://www.instagram.com/',        cat: 'social',      desc: 'Connect with friends, share moments' },
    { name: 'Twitter / X',     url: 'https://x.com/',                    cat: 'social',      desc: 'Join the conversation' },
    { name: 'LinkedIn',        url: 'https://www.linkedin.com/',         cat: 'social',      desc: 'Professional networking' },
    { name: 'Discord',         url: 'https://discord.com/app',           cat: 'social',      desc: 'Chat with your communities' },
    { name: 'YouTube',         url: 'https://www.youtube.com/',          cat: 'video',       desc: 'Watch videos and live streams' },
    { name: 'Netflix',         url: 'https://www.netflix.com/',          cat: 'video',       desc: 'Watch movies and TV shows' },
    { name: 'Twitch',          url: 'https://www.twitch.tv/',            cat: 'video',       desc: 'Watch live game streams' },
    { name: 'Spotify',         url: 'https://open.spotify.com/',         cat: 'music',       desc: 'Stream music and podcasts' },
    { name: 'SoundCloud',      url: 'https://soundcloud.com/',           cat: 'music',       desc: 'Discover and share music' },
    { name: 'Amazon',          url: 'https://www.amazon.com/',           cat: 'shopping',    desc: 'Shop millions of products' },
    { name: 'Hacker News',     url: 'https://news.ycombinator.com/',     cat: 'news',        desc: 'Tech news and discussion' },
    { name: 'BBC News',        url: 'https://www.bbc.com/news',          cat: 'news',        desc: 'World news coverage' },
    { name: 'Notion',          url: 'https://www.notion.com/',           cat: 'productivity',desc: 'All-in-one workspace' },
    { name: 'GitHub',          url: 'https://github.com/',               cat: 'productivity',desc: 'Build and ship software' },
    { name: 'Trello',          url: 'https://trello.com/',               cat: 'productivity',desc: 'Visual project management' },
    { name: 'Figma',           url: 'https://www.figma.com/',            cat: 'productivity',desc: 'Collaborative design tool' },
    { name: 'Google Maps',     url: 'https://maps.google.com/',          cat: 'tools',       desc: 'Navigate and explore the world' },
    { name: 'Stack Overflow',  url: 'https://stackoverflow.com/',        cat: 'tools',       desc: 'Q&A for developers' },
    { name: 'Yahoo Mail',      url: 'https://mail.yahoo.com/',           cat: 'productivity',desc: 'Check your Yahoo email' },
  ];

  let currentPinPickerCat = 'all';

  // Pinned URLs as a Set, kept fresh by the storage listener below, so rendering
  // the picker needs no storage round trip and membership tests are O(1).
  let pinnedUrlSet = new Set();
  let pinnedRevision = 0;
  let lastPickerSignature = null;
  let pinSearchTimer = null;

  function refreshPinnedUrlSet(pinnedSites) {
    pinnedUrlSet = new Set((pinnedSites || []).map((s) => s.url));
    pinnedRevision++;
  }

  // Chrome's local favicon cache. No network request, so nothing leaks to a
  // third party and the nav strip paints without waiting on a round trip.
  function faviconUrl(url) {
    const fav = new URL(chrome.runtime.getURL('/_favicon/'));
    fav.searchParams.set('pageUrl', url);
    fav.searchParams.set('size', '32');
    return fav.toString();
  }

  function openPinPicker() {
    pinUrlInput.value = '';
    pinPickerSearch.value = '';
    currentPinPickerCat = 'all';
    document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === 'all'));
    pinPicker.classList.remove('hidden');
    renderPinPickerLists();
    pinPickerSearch.focus();
  }

  function renderPinPickerLists() {
    const query = pinPickerSearch.value.trim().toLowerCase();

    // Rebuilding ~40 nodes with a favicon each on every keystroke is wasteful.
    // Bail out when the visible result set cannot have changed.
    const signature = `${currentPinPickerCat}|${query}|${pinnedRevision}`;
    if (signature === lastPickerSignature) return;
    lastPickerSignature = signature;

    const isPinned = (url) => pinnedUrlSet.has(url);

    // Quick Access Grid
    const qaGrid = document.getElementById('quick-access-grid');
    const qaItems = CURATED_SITES.filter((s) => s.quickAccess);
    qaGrid.innerHTML = '';
    qaItems.forEach((site) => {
      if (query && !site.name.toLowerCase().includes(query) && !site.url.toLowerCase().includes(query)) return;
      const pinned = isPinned(site.url);
      const btn = document.createElement('button');
      btn.className = 'qa-item' + (pinned ? ' already-pinned' : '');
      btn.title = pinned ? 'Already pinned' : `Pin ${site.name}`;
      btn.innerHTML = `
        <div class="qa-icon-wrap">
          <img src="${faviconUrl(site.url)}" alt="">
        </div>
        <span class="qa-label">${site.name}</span>`;
      if (!pinned) {
        btn.addEventListener('click', () => addPin(site.url, site.name, false));
      }
      qaGrid.appendChild(btn);
    });

    // Show/hide quick access section
    document.getElementById('quick-access-section').style.display = qaGrid.children.length === 0 ? 'none' : '';

    // Discover List
    const discoverList = document.getElementById('discover-list');
    const discoverItems = CURATED_SITES.filter((s) => !s.quickAccess);
    discoverList.innerHTML = '';
    discoverItems.forEach((site) => {
      const matchesCat = currentPinPickerCat === 'all' || site.cat === currentPinPickerCat;
      const matchesQuery = !query || site.name.toLowerCase().includes(query) || site.url.toLowerCase().includes(query);
      if (!matchesCat || !matchesQuery) return;
      const pinned = isPinned(site.url);
      const item = document.createElement('div');
      item.className = 'discover-item';
      item.innerHTML = `
        <div class="discover-icon"><img src="${faviconUrl(site.url)}" alt=""></div>
        <div class="discover-info">
          <div class="discover-name">${site.name}</div>
          <div class="discover-desc">${site.desc}</div>
        </div>
        <button class="discover-pin-btn ${pinned ? 'pinned' : ''}" title="${pinned ? 'Already pinned' : 'Pin'}">${pinned ? '✓' : '+'}</button>`;
      if (!pinned) {
        const pin = () => addPin(site.url, site.name, false);
        item.querySelector('.discover-pin-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          pin();
        });
        item.addEventListener('click', pin);
      }
      discoverList.appendChild(item);
    });
  }

  function refreshPinPickerState() {
    if (!pinPicker.classList.contains('hidden')) {
      renderPinPickerLists();
    }
  }

  // Category tab clicks
  document.querySelectorAll('.cat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentPinPickerCat = tab.dataset.cat;
      renderPinPickerLists();
    });
  });

  // Search input
  pinPickerSearch.addEventListener('input', () => {
    // Debounce: each keystroke used to cost a storage read plus a full rebuild
    // of both lists.
    clearTimeout(pinSearchTimer);
    pinSearchTimer = setTimeout(renderPinPickerLists, 120);
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
  let splitDragMetrics = null;
  let splitFramePending = false;

  splitDivider.addEventListener('mousedown', (e) => {
    isDraggingSplit = true;
    document.body.style.cursor = 'ns-resize';
    primaryWorkspace.style.pointerEvents = 'none';
    secondaryWorkspace.style.pointerEvents = 'none';

    // Measure once per drag. Calling getBoundingClientRect() inside mousemove
    // forces a synchronous layout on every pointer event, and the style writes
    // below invalidate layout again immediately after.
    splitDragMetrics = {
      containerHeight: contentArea.getBoundingClientRect().height,
      appBarHeight: appBar.classList.contains('hidden') ? 0 : appBar.getBoundingClientRect().height,
    };
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDraggingSplit) return;

    // Coalesce bursts of pointer events into one style write per frame.
    if (splitFramePending) return;
    splitFramePending = true;
    const clientY = e.clientY;

    requestAnimationFrame(() => {
      splitFramePending = false;
      if (!splitDragMetrics) return;

      let newHeight = clientY - splitDragMetrics.appBarHeight;

      // Bounds checking
      if (newHeight < 100) newHeight = 100;
      const maxHeight = splitDragMetrics.containerHeight - 100;
      if (newHeight > maxHeight) newHeight = maxHeight;

      primaryWorkspace.style.flex = `0 0 ${newHeight}px`;
      secondaryWorkspace.style.flex = '1 1 0%';
    });
  });

  document.addEventListener('mouseup', () => {
    if (isDraggingSplit) {
      isDraggingSplit = false;
      // Do NOT clear splitDragMetrics here: a coalesced frame may still be
      // pending, and it carries the final pointer position. It is always
      // reassigned on the next mousedown.
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
    chrome.tabs.create({ url: currentViewUrl });
  });

  menuRefresh.addEventListener('click', () => {
    // Force reload by removing from cache then reloading
    const cached = iframeCache.get(currentViewUrl);
    if (cached) { cached.remove(); iframeCache.delete(currentViewUrl); }
    loadUrl(currentViewUrl);
    barMenu.classList.add('hidden');
  });

  menuCopy.addEventListener('click', () => {
    navigator.clipboard.writeText(currentViewUrl).then(() => {
      const originalText = menuCopy.textContent;
      menuCopy.textContent = "Copied!";
      setTimeout(() => { menuCopy.textContent = originalText; barMenu.classList.add('hidden'); }, 1000);
    });
  });

  // AI handoff: the background (context menus) or the bar menu below stashes
  // a prompt built from the active tab. The panel consumes it by focusing the
  // AI provider and copying the prompt, since clipboard writes from a service
  // worker are unreliable and AI iframes are cross-origin (no direct inject).
  const toast = document.getElementById('toast');
  let toastTimer = null;

  function showToast(msg, ms = 3500) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), ms);
  }

  // Self-contained for chrome.scripting: no closures or outside references.
  function extractPageText() {
    const bodyText = (document.body && document.body.innerText) || '';
    return { text: bodyText.slice(0, 6000), title: document.title, url: location.href };
  }

  function consumeAiHandoff(handoff) {
    if (!handoff || !handoff.prompt) return;
    chrome.storage.local.remove('aiHandoff');
    setActiveIcon(currentAiProvider);
    loadUrl(currentAiProvider);
    navigator.clipboard.writeText(handoff.prompt).then(
      () => showToast('Prompt copied — paste it into the AI chat.'),
      () => showToast('AI ready — copy failed, please copy manually.')
    );
  }

  if (menuSummarize) {
    menuSummarize.addEventListener('click', () => {
      barMenu.classList.add('hidden');
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs && tabs[0];
        if (!tab || !/^https?:\/\//.test(tab.url || '')) {
          showToast('Open a web page first, then summarize.');
          return;
        }
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, func: extractPageText },
          (results) => {
            if (chrome.runtime.lastError || !results || !results[0] || !results[0].result) {
              showToast('Could not read this page.');
              return;
            }
            const data = results[0].result;
            if (!data.text) {
              showToast('Nothing readable on this page.');
              return;
            }
            consumeAiHandoff({
              prompt: `Summarize the key points from "${data.title || 'this page'}" (${data.url}):\n\n"""\n${data.text}\n"""`,
              title: data.title,
              url: data.url,
            });
          }
        );
      });
    });
  }

  barMinimize.addEventListener('click', () => {
    loadUrl(currentAiProvider);
    setActiveIcon(currentAiProvider);
  });

  barClose.addEventListener('click', () => {
    window.close();
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
      const hostname = new URL(currentViewUrl).hostname;
      if (desktopToggle.checked && !desktopSites.includes(hostname)) {
        desktopSites.push(hostname);
      } else if (!desktopToggle.checked && desktopSites.includes(hostname)) {
        desktopSites = desktopSites.filter(h => h !== hostname);
      }
      
      chrome.storage.local.set({ desktopSites }, () => {
        if (chrome.runtime.lastError) {
          console.error('Error saving desktop sites:', chrome.runtime.lastError);
          return;
        }
        updateDesktopModeRulsets(hostname, desktopToggle.checked);
        // Force reload from cache
        const cached = iframeCache.get(currentViewUrl);
        if (cached) { cached.remove(); iframeCache.delete(currentViewUrl); }
        loadUrl(currentViewUrl);
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
