/**
 * Workspaces: named pin sets synced across devices.
 *
 * pinnedSites stays the render source of truth (the rail, the frame rules and
 * the tests all read it), so every mutation here mirrors the active
 * workspace's sites into pinnedSites in the same storage write. The workspace
 * keys ride along in that write, which keeps onChanged to a single event.
 *
 * Cross-device sync is write-through to chrome.storage.sync (best effort:
 * quota errors fall back to local silently) plus last-write-wins adoption on
 * load via workspacesUpdatedAt.
 *
 * Loaded as a plain script in the panel and via importScripts in the service
 * worker, so this file must stay free of window/document references.
 */

const WS_KEYS = ['workspaces', 'activeWorkspaceId', 'workspaceSites', 'workspacesUpdatedAt'];

const WS_DEFAULT_PINS = [
  { url: 'https://gemini.google.com/', title: 'Gemini' },
  { url: 'https://www.bing.com/translator', title: 'Bing Translator' },
  { url: 'https://github.com/', title: 'GitHub' },
];

function wsId() {
  return 'ws-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
}

function wsPickNewer(local, synced) {
  const l = local && local.workspaces;
  const s = synced && synced.workspaces;
  if (Array.isArray(l) && l.length && (!Array.isArray(s) || !s.length)) return { source: local, fromSync: false };
  if (Array.isArray(s) && s.length && (!Array.isArray(l) || !l.length)) return { source: synced, fromSync: true };
  if (Array.isArray(l) && Array.isArray(s) && l.length && s.length) {
    return (synced.workspacesUpdatedAt || 0) > (local.workspacesUpdatedAt || 0)
      ? { source: synced, fromSync: true }
      : { source: local, fromSync: false };
  }
  return { source: null, fromSync: false };
}

function wsMigratedState(legacySites) {
  const id = wsId();
  // An explicitly empty pin list is legitimate (tests and fresh resets use
  // it); only a missing key seeds the default pins.
  const sites = Array.isArray(legacySites) ? legacySites : WS_DEFAULT_PINS.slice();
  return {
    workspaces: [{ id, name: 'General' }],
    activeWorkspaceId: id,
    workspaceSites: { [id]: sites },
    workspacesUpdatedAt: Date.now(),
  };
}

function wsActiveSites(state) {
  if (!state) return [];
  const sites = state.workspaceSites && state.workspaceSites[state.activeWorkspaceId];
  return Array.isArray(sites) ? sites : [];
}

/** Best-effort mirror; sync quota failures must never break local writes. */
function wsMirrorToSync(payload) {
  try {
    chrome.storage.sync.set(payload, () => {
      if (chrome.runtime.lastError) {
        console.warn('Workspace sync skipped:', chrome.runtime.lastError.message);
      }
    });
  } catch (error) {
    console.warn('Workspace sync skipped:', error);
  }
}

function wsPersist(state, callback) {
  const sites = wsActiveSites(state);
  const payload = {
    workspaces: state.workspaces,
    activeWorkspaceId: state.activeWorkspaceId,
    workspaceSites: state.workspaceSites,
    workspacesUpdatedAt: state.workspacesUpdatedAt || Date.now(),
    pinnedSites: sites,
  };
  chrome.storage.local.set(payload, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving workspaces:', chrome.runtime.lastError);
    } else {
      wsMirrorToSync(payload);
    }
    if (callback) callback(state);
  });
}

function wsHasWorkspaces(snapshot) {
  return !!(snapshot && Array.isArray(snapshot.workspaces) && snapshot.workspaces.length);
}

/**
 * Workspaces exist: converge a diverged raw mirror, then adopt newer synced
 * state if another device wrote one. The heal only touches workspace keys,
 * never raw pinnedSites, so a concurrent writer elsewhere cannot be
 * clobbered by it.
 */
function wsNormalPath(local, callback) {
  // A direct pinnedSites write (older clients, tests) bypasses the
  // mirror: fold it into the active workspace so mutations and switches
  // never resurrect stale pins. pinnedSites is the rail's render source,
  // so it wins.
  const mirror = local.workspaceSites && local.workspaceSites[local.activeWorkspaceId];
  if (Array.isArray(local.pinnedSites) &&
      JSON.stringify(local.pinnedSites) !== JSON.stringify(mirror || [])) {
    const healed = {
      workspaces: local.workspaces,
      activeWorkspaceId: local.activeWorkspaceId,
      workspaceSites: Object.assign({}, local.workspaceSites),
      workspacesUpdatedAt: Date.now(),
    };
    healed.workspaceSites[healed.activeWorkspaceId] = local.pinnedSites.slice();
    chrome.storage.local.set({
      workspaces: healed.workspaces,
      activeWorkspaceId: healed.activeWorkspaceId,
      workspaceSites: healed.workspaceSites,
      workspacesUpdatedAt: healed.workspacesUpdatedAt,
    }, () => callback(healed));
    return;
  }
  // Another device may have written newer state.
  chrome.storage.sync.get(WS_KEYS.concat(['pinnedSites']), (synced) => {
    if (chrome.runtime.lastError || !synced) {
      callback(local);
      return;
    }
    if (Array.isArray(synced.workspaces) && synced.workspaces.length &&
        (synced.workspacesUpdatedAt || 0) > (local.workspacesUpdatedAt || 0)) {
      const adopted = {
        workspaces: synced.workspaces,
        activeWorkspaceId: synced.activeWorkspaceId,
        workspaceSites: synced.workspaceSites || {},
        workspacesUpdatedAt: synced.workspacesUpdatedAt,
      };
      const sites = wsActiveSites(adopted);
      chrome.storage.local.set({
        workspaces: adopted.workspaces,
        activeWorkspaceId: adopted.activeWorkspaceId,
        workspaceSites: adopted.workspaceSites,
        workspacesUpdatedAt: adopted.workspacesUpdatedAt,
        pinnedSites: sites,
      }, () => callback(adopted));
    } else {
      callback(local);
    }
  });
}

/**
 * Mint the first workspace. Re-reads before writing: panel loads (and their
 * migration chains) routinely overlap writes from tests or a second load,
 * and a stale snapshot must never clobber raw pinnedSites — the write omits
 * that key whenever it already exists.
 */
function wsMintFresh(callback) {
  chrome.storage.local.get(WS_KEYS.concat(['pinnedSites']), (fresh) => {
    if (chrome.runtime.lastError) {
      fresh = {};
    }
    if (wsHasWorkspaces(fresh)) {
      // Another load minted while we were reading: converge instead.
      wsNormalPath(fresh, callback);
      return;
    }
    const raw = Array.isArray(fresh.pinnedSites) ? fresh.pinnedSites : null;
    const minted = wsMigratedState(raw || undefined);
    if (raw) {
      // Mirror the winner without touching it.
      minted.workspaceSites[minted.activeWorkspaceId] = raw.slice();
      const payload = {
        workspaces: minted.workspaces,
        activeWorkspaceId: minted.activeWorkspaceId,
        workspaceSites: minted.workspaceSites,
        workspacesUpdatedAt: minted.workspacesUpdatedAt,
      };
      chrome.storage.local.set(payload, () => {
        const mirrored = Object.assign({ pinnedSites: raw.slice() }, payload);
        wsMirrorToSync(mirrored);
        callback(minted);
      });
    } else {
      wsPersist(minted, callback);
    }
  });
}

/**
 * Loads workspace state, migrating legacy pinnedSites (or seeding defaults)
 * on first run and adopting the newer side when both areas disagree.
 */
function wsEnsureState(callback) {
  chrome.storage.local.get(WS_KEYS.concat(['pinnedSites']), (local) => {
    if (chrome.runtime.lastError) {
      console.error('Error reading workspaces:', chrome.runtime.lastError);
      callback({ workspaces: [], activeWorkspaceId: null, workspaceSites: {} });
      return;
    }
    if (wsHasWorkspaces(local)) {
      wsNormalPath(local, callback);
      return;
    }
    // First run (or pre-workspace install): check sync before minting fresh.
    chrome.storage.sync.get(WS_KEYS.concat(['pinnedSites']), (synced) => {
      if (chrome.runtime.lastError) {
        synced = null;
      }
      const pick = wsPickNewer(local, synced);
      if (pick.source) {
        const adopted = {
          workspaces: pick.source.workspaces,
          activeWorkspaceId: pick.source.activeWorkspaceId,
          workspaceSites: pick.source.workspaceSites || {},
          workspacesUpdatedAt: pick.source.workspacesUpdatedAt || Date.now(),
        };
        const sites = wsActiveSites(adopted);
        chrome.storage.local.set({
          workspaces: adopted.workspaces,
          activeWorkspaceId: adopted.activeWorkspaceId,
          workspaceSites: adopted.workspaceSites,
          workspacesUpdatedAt: adopted.workspacesUpdatedAt,
          pinnedSites: sites,
        }, () => callback(adopted));
        return;
      }
      wsMintFresh(callback);
    });
  });
}

function wsSetActiveSites(sites, callback) {
  wsEnsureState((state) => {
    state.workspaceSites[state.activeWorkspaceId] = sites;
    state.workspacesUpdatedAt = Date.now();
    wsPersist(state, callback);
  });
}

function wsSwitch(id, callback) {
  wsEnsureState((state) => {
    if (!state.workspaceSites[id]) return;
    state.activeWorkspaceId = id;
    state.workspacesUpdatedAt = Date.now();
    wsPersist(state, callback);
  });
}

function wsCreate(name, callback) {
  wsEnsureState((state) => {
    const id = wsId();
    state.workspaces.push({ id, name: name || ('Workspace ' + (state.workspaces.length + 1)) });
    state.workspaceSites[id] = [];
    state.activeWorkspaceId = id;
    state.workspacesUpdatedAt = Date.now();
    wsPersist(state, callback);
  });
}

function wsRename(id, name, callback) {
  if (!name) return;
  wsEnsureState((state) => {
    const ws = state.workspaces.find((w) => w.id === id);
    if (!ws) return;
    ws.name = name;
    state.workspacesUpdatedAt = Date.now();
    wsPersist(state, callback);
  });
}

function wsDelete(id, callback) {
  wsEnsureState((state) => {
    if (!state.workspaceSites[id]) return;
    state.workspaces = state.workspaces.filter((w) => w.id !== id);
    delete state.workspaceSites[id];
    if (!state.workspaces.length) {
      const fresh = wsMigratedState([]);
      fresh.workspaces[0].name = 'General';
      state.workspaces = fresh.workspaces;
      state.workspaceSites = fresh.workspaceSites;
    }
    if (state.activeWorkspaceId === id || !state.workspaceSites[state.activeWorkspaceId]) {
      state.activeWorkspaceId = state.workspaces[0].id;
    }
    state.workspacesUpdatedAt = Date.now();
    wsPersist(state, callback);
  });
}

function wsAddPin(url, title, callback) {
  // Base the duplicate check and append on raw pinnedSites when present: it
  // is the rail's render source, so a direct external write must win over a
  // stale workspace mirror.
  chrome.storage.local.get(['pinnedSites'], (raw) => {
    wsEnsureState((state) => {
      const base = Array.isArray(raw && raw.pinnedSites)
        ? raw.pinnedSites
        : wsActiveSites(state);
      const sites = base.slice();
      if (!sites.find((s) => s.url === url)) {
        sites.push({ url, title: title || url });
        state.workspaceSites[state.activeWorkspaceId] = sites;
        state.workspacesUpdatedAt = Date.now();
        wsPersist(state, (s) => callback && callback(s, true));
      } else if (callback) {
        callback(state, false);
      }
    });
  });
}

globalThis.SidekickWorkspaces = {
  ensureState: wsEnsureState,
  setActiveSites: wsSetActiveSites,
  switchWorkspace: wsSwitch,
  createWorkspace: wsCreate,
  renameWorkspace: wsRename,
  deleteWorkspace: wsDelete,
  addPin: wsAddPin,
  activeSites: wsActiveSites,
  WS_KEYS,
};
