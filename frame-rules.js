/**
 * Framing-header rules, scoped to what the user actually pinned.
 *
 * These used to live in a static ruleset with no urlFilter, which meant Chrome
 * rewrote response headers and spoofed the User-Agent on every subframe of
 * every page in every tab — not just the frames this panel creates.
 *
 * A static ruleset cannot express "only my frames": DNR's initiatorDomains only
 * accepts real ASCII domains, so a chrome-extension:// origin is not matchable.
 * So these are dynamic rules, keyed on the pinned request domains instead, and
 * rewritten whenever pinnedSites changes.
 */

const RULE_IDS = {
  stripFramingHeaders: 1,
  spoofMobileUserAgent: 2,
  spoofInstagramAssets: 3,
};

const ALL_RULE_IDS = Object.values(RULE_IDS);

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 EdgA/116.0.0.0';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const FRAMING_HEADERS = [
  { header: 'x-frame-options', operation: 'remove' },
  { header: 'content-security-policy', operation: 'remove' },
  { header: 'content-security-policy-report-only', operation: 'remove' },
  // x.com serves `cross-origin-resource-policy: same-origin` on top of
  // X-Frame-Options + frame-ancestors, so stripping only the framing headers
  // still leaves Chrome's "refused to connect" page. COEP/COOP can block
  // framing the same way on other sites, so strip the whole cross-origin
  // isolation family for the panel's sub_frames.
  { header: 'cross-origin-resource-policy', operation: 'remove' },
  { header: 'cross-origin-embedder-policy', operation: 'remove' },
  { header: 'cross-origin-opener-policy', operation: 'remove' },
];

/**
 * Media hosts that must keep the desktop User-Agent. With the mobile UA,
 * www.youtube.com answers 302 to m.youtube.com, whose player is built for
 * foreground-only playback and pauses as soon as the frame is backgrounded.
 * The desktop player keeps audio going, so these domains get framing-header
 * stripping but never the Android spoof. Kept in registrable-domain form to
 * match what hostnames() produces.
 */
const DESKTOP_UA_HOSTS = [
  'youtube.com',
  'youtu.be',
  'spotify.com',
  'soundcloud.com',
  'twitch.tv',
  'netflix.com',
];

function isDesktopUaHost(domain) {
  return DESKTOP_UA_HOSTS.some((h) => domain === h || domain.endsWith('.' + h));
}

/**
 * Reduces a hostname to its registrable domain (last two labels), because
 * pinned sites routinely redirect across their own subdomains and DNR only
 * matches what requestDomains lists: www.twitch.tv -> m.twitch.tv,
 * maps.google.com -> consent.google.com, mail.yahoo.com -> login.yahoo.com.
 * DNR matches subdomains of listed domains, so the registrable domain covers
 * the whole login/consent/mobile-redirect chain while staying scoped to what
 * the user pinned. IPs and single-label hosts pass through untouched.
 * (Two-label approximation: good enough for real site domains.)
 */
function registrableDomain(hostname) {
  if (!hostname || hostname === 'localhost') return hostname;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(':')) return hostname;
  const parts = hostname.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
}

/** Unique registrable domains from pinned sites plus the AI provider and search engine. */
function hostnames(pinnedSites, extraUrls) {
  const hosts = new Set();
  const add = (url) => {
    try {
      const { hostname } = new URL(url);
      const domain = registrableDomain(hostname);
      if (domain) hosts.add(domain);
    } catch {}
  };
  for (const site of pinnedSites || []) add(site.url);
  for (const url of extraUrls || []) add(url);
  return [...hosts].sort();
}

function stripFramingHeadersRule(requestDomains) {
  return {
    id: RULE_IDS.stripFramingHeaders,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      responseHeaders: FRAMING_HEADERS,
    },
    condition: {
      requestDomains,
      resourceTypes: ['sub_frame'],
    },
  };
}

function spoofMobileUserAgentRule(requestDomains) {
  return {
    id: RULE_IDS.spoofMobileUserAgent,
    priority: 2,
    action: {
      type: 'modifyHeaders',
      // The UA says Android, so the client hints must agree. Chrome keeps
      // sending the host's real (desktop) hints otherwise, and that
      // UA/hints mismatch is a classic bot signal: Cloudflare-fronted sites
      // such as chatgpt.com answer with harder challenges that can stall
      // inside a sandboxed frame. (Instagram already does the same dance
      // for iOS in spoofInstagramAssetsRule.)
      requestHeaders: [
        { header: 'User-Agent', operation: 'set', value: ANDROID_UA },
        { header: 'Sec-Ch-Ua', operation: 'set', value: '"Chromium";v="116", "Not)A;Brand";v="24", "Google Chrome";v="116"' },
        { header: 'Sec-Ch-Ua-Mobile', operation: 'set', value: '?1' },
        { header: 'Sec-Ch-Ua-Platform', operation: 'set', value: '"Android"' },
      ],
    },
    condition: {
      requestDomains,
      resourceTypes: ['sub_frame'],
    },
  };
}

/**
 * Instagram needs its own subresources spoofed as iOS too, not just the frame
 * itself. main_frame is deliberately excluded: previously this rule rewrote the
 * User-Agent of Instagram opened in a real tab, which is not what anyone wants.
 */
function spoofInstagramAssetsRule(requestDomains) {
  const domains = requestDomains.filter(
    (d) => d === 'instagram.com' || d.endsWith('.instagram.com')
  );
  if (!domains.length) return null;

  return {
    id: RULE_IDS.spoofInstagramAssets,
    priority: 3,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'User-Agent', operation: 'set', value: IOS_UA },
        { header: 'Sec-Ch-Ua', operation: 'set', value: '"Not/A)Brand";v="99", "Mobile Safari";v="17"' },
        { header: 'Sec-Ch-Ua-Mobile', operation: 'set', value: '?1' },
        { header: 'Sec-Ch-Ua-Platform', operation: 'set', value: '"iOS"' },
      ],
    },
    condition: {
      requestDomains: domains,
      resourceTypes: ['sub_frame', 'xmlhttprequest', 'script', 'stylesheet', 'image', 'media', 'font', 'other'],
    },
  };
}

/**
 * Rewrites the dynamic ruleset to match the frames this panel creates: pinned
 * sites plus the AI provider and search engine, which live in their own
 * frames but are never part of pinnedSites.
 *
 * Accepts either the legacy pinned-sites array or
 * { pinnedSites, aiProvider, defaultSearchEngine }.
 */
async function sync(sources) {
  const pinnedSites = Array.isArray(sources) ? sources : sources?.pinnedSites;
  const extraUrls = Array.isArray(sources)
    ? []
    : [sources?.aiProvider, sources?.defaultSearchEngine].filter(Boolean);
  const requestDomains = hostnames(pinnedSites, extraUrls);
  // Media hosts stay on their desktop player (see DESKTOP_UA_HOSTS), so keep
  // them out of the mobile-UA rule while still stripping framing headers.
  const mobileDomains = requestDomains.filter((d) => !isDesktopUaHost(d));

  const addRules = requestDomains.length
    ? [
        stripFramingHeadersRule(requestDomains),
        mobileDomains.length ? spoofMobileUserAgentRule(mobileDomains) : null,
        spoofInstagramAssetsRule(requestDomains),
      ].filter(Boolean)
    : [];

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ALL_RULE_IDS,
      addRules,
    });
  } catch (error) {
    console.error('Error syncing framing rules:', error);
  }
}

/**
 * Seeds from current storage and keeps up with every writer of the framed
 * URLs, including the background context menu and the welcome modals.
 * `fallbacks` covers first run, before the welcome flow has stored anything.
 */
function install(fallbacks) {
  const KEYS = ['pinnedSites', 'aiProvider', 'defaultSearchEngine'];

  const readAndSync = () => {
    chrome.storage.local.get(KEYS, (result) => {
      if (chrome.runtime.lastError) {
        console.error('Error reading framed sites for rules:', chrome.runtime.lastError);
        return;
      }
      sync({
        pinnedSites: result.pinnedSites || [],
        aiProvider: result.aiProvider || fallbacks?.aiProvider,
        defaultSearchEngine: result.defaultSearchEngine || fallbacks?.defaultSearchEngine,
      });
    });
  };

  readAndSync();

  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && KEYS.some((k) => changes[k])) {
      readAndSync();
    }
  });
}

globalThis.SidekickFrameRules = { install, sync, hostnames, registrableDomain, RULE_IDS, isDesktopUaHost };