const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, openPanel, liveFrames, chromium, EXTENSION_PATH } = require('./fixtures');

const LAUNCH_ARGS = [
  `--disable-extensions-except=${EXTENSION_PATH}`,
  `--load-extension=${EXTENSION_PATH}`,
];

test.describe('RAM budget', () => {
  test('does not eagerly load the hidden split-view frame', async ({ page, extensionId }) => {
    await openPanel(page, extensionId);

    // The split-view iframe sits inside a display:none container but is
    // preloaded with Copilot in markup. A hidden iframe still loads and runs,
    // so this used to pull the whole Copilot SPA into RAM on every panel open.
    const secondary = page.locator('#secondary-frame');
    await expect(secondary).toHaveAttribute('src', 'about:blank');
  });

  test('holds no more than the configured number of warm sites', async ({ page, extensionId }) => {
    await openPanel(page, extensionId);

    // Only the AI provider is preloaded. Nothing else should be live yet.
    const frames = await liveFrames(page);
    expect(frames.map((f) => f.id)).toEqual(['ai-frame']);
  });

  test('cache limit holds across many site switches', async ({ page, context, extensionId }) => {
    // Serve real pages locally so switching costs no network and stays fast.
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><title>${req.url}</title><body>${req.url}</body>`);
    });
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address();

    const urls = Array.from({ length: 5 }, (_, i) => `http://127.0.0.1:${port}/site-${i}`);
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate((pinned) => chrome.storage.local.set({
      pinnedSites: pinned,
      aiProviderHasBeenSet: true,
    }), urls.map((url, i) => ({ url, title: `Site ${i}` })));

    // Reload so the nav strip renders the freshly pinned sites.
    await openPanel(page, extensionId);
    const icons = page.locator('#pinned-sites-container .app-icon');
    await expect(icons).toHaveCount(urls.length);

    // Visit every site in turn. Cached frames are the ones created dynamically,
    // which carry no id.
    const seen = [];
    for (let i = 0; i < urls.length; i++) {
      await icons.nth(i).click();
      await page.waitForTimeout(150);
      seen.push(await page.$eval('.workspace iframe:not([id])[src]:not([src="about:blank"])', (f) => f.src).catch(() => null));
    }

    const cached = await page.$$eval('iframe', (frames) =>
      frames.filter((f) => !f.id && f.getAttribute('src') && f.getAttribute('src') !== 'about:blank').length
    );

    // Every site was genuinely loaded...
    expect(seen.filter(Boolean).length).toBe(urls.length);
    // ...but the pool never grew past the limit.
    expect(cached).toBeLessThanOrEqual(2);

    server.close();
  });
});

test.describe('privacy', () => {
  test('favicons come from the local Chrome cache, not Google', async ({ page, context, extensionId }) => {
    const external = [];
    context.on('request', (req) => {
      const url = req.url();
      if (url.includes('google.com/s2/favicons')) external.push(url);
    });

    await openPanel(page, extensionId);
    await page.evaluate(() => globalThis.SidekickFrameRules.sync([
      { url: 'https://example.com/' },
      { url: 'https://github.com/' },
    ]));
    await page.waitForTimeout(500);

    expect(external).toEqual([]);
  });

  test('orphaned drops key is swept when the worker restarts', async () => {
    // A fresh profile never has a `drops` key, so this test drives two launches
    // against one profile dir: seed the key, then restart the browser so the
    // top-level cleanup runs again. That is the real upgrade path.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sidekick-'));
    const launch = async () => {
      const ctx = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        args: LAUNCH_ARGS,
      });
      let [worker] = ctx.serviceWorkers();
      if (!worker) worker = await ctx.waitForEvent('serviceworker');
      return { ctx, worker };
    };

    try {
      const first = await launch();
      await first.worker.evaluate(() => chrome.storage.local.set({
        drops: [{ id: 'abc', type: 'text', data: 'old note', timestamp: 1700000000000 }],
        pinnedSites: [{ url: 'https://example.com/', title: 'Example' }],
      }));
      const seeded = await first.worker.evaluate(() =>
        chrome.storage.local.get('drops').then((r) => Array.isArray(r.drops))
      );
      expect(seeded).toBe(true);
      await first.ctx.close();

      const second = await launch();
      const stillHasDrops = await second.worker.evaluate(() =>
        chrome.storage.local.get('drops').then((r) => Array.isArray(r.drops))
      );
      expect(stillHasDrops).toBe(false);

      // The sweep must not touch anything else.
      const pinned = await second.worker.evaluate(() =>
        chrome.storage.local.get('pinnedSites').then((r) => r.pinnedSites)
      );
      expect(pinned).toEqual([{ url: 'https://example.com/', title: 'Example' }]);
      await second.ctx.close();
    } finally {
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

test.describe('declarativeNetRequest scoping', () => {
  test('no static rulesets are enabled', async ({ serviceWorker }) => {
    // A blanket static ruleset would silently rewrite headers for every subframe
    // in every tab. getDynamicRules() alone cannot see one, so assert on this too.
    const enabled = await serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getEnabledRulesets()
    );
    expect(enabled).toEqual([]);
  });

  test('does not match subframes belonging to unrelated sites', async ({ page, serviceWorker, extensionId }) => {
    await openPanel(page, extensionId);
    await page.evaluate(() => globalThis.SidekickFrameRules.sync([{ url: 'https://chatgpt.com/' }]));

    // A third-party page embedding some unrelated site in an iframe.
    const unrelated = await serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.testMatchOutcome({
        url: 'https://www.some-random-blog.example/post',
        type: 'sub_frame',
        initiator: 'https://www.another-site.example/',
        method: 'get',
      })
    );

    expect(unrelated.matchedRules).toEqual([]);
  });

  test('does not match top-level navigation to a pinned domain', async ({ page, serviceWorker, extensionId }) => {
    await openPanel(page, extensionId);
    await page.evaluate(() => globalThis.SidekickFrameRules.sync([{ url: 'https://chatgpt.com/' }]));

    // Opening ChatGPT in a real tab must not be rewritten.
    const topLevel = await serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.testMatchOutcome({
        url: 'https://chatgpt.com/',
        type: 'main_frame',
        initiator: 'https://www.google.com/',
        method: 'get',
      })
    );

    expect(topLevel.matchedRules).toEqual([]);
  });

  test('does match a pinned domain loaded as a subframe', async ({ page, serviceWorker, extensionId }) => {
    await openPanel(page, extensionId);
    await page.evaluate(() => globalThis.SidekickFrameRules.sync([{ url: 'https://chatgpt.com/' }]));

    const pinned = await serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.testMatchOutcome({
        url: 'https://chatgpt.com/',
        type: 'sub_frame',
        initiator: 'https://www.google.com/',
        method: 'get',
      })
    );

    expect(pinned.matchedRules.length).toBeGreaterThan(0);
  });

  test('the AI provider is covered even when nothing is pinned', async ({ page, serviceWorker, extensionId }) => {
    await openPanel(page, extensionId);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      aiProvider: 'https://chatgpt.com/',
      defaultSearchEngine: 'https://www.google.com/search?q=',
      pinnedSites: [],
    }));

    // The storage listener resyncs asynchronously; wait for it to land.
    await expect.poll(async () => serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getDynamicRules().then((r) => r.length)
    ), { timeout: 5000 }).toBeGreaterThan(0);

    for (const url of ['https://chatgpt.com/', 'https://www.google.com/search?q=test']) {
      const outcome = await serviceWorker.evaluate((u) =>
        chrome.declarativeNetRequest.testMatchOutcome({
          url: u, type: 'sub_frame', initiator: 'https://x.example/', method: 'get',
        }), url);
      expect(outcome.matchedRules.length, `${url} should match`).toBeGreaterThan(0);
    }
  });

  test('switching the AI provider re-scopes the rules', async ({ page, serviceWorker, extensionId }) => {
    await openPanel(page, extensionId);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      aiProvider: 'https://chatgpt.com/',
      pinnedSites: [],
    }));
    await expect.poll(async () => serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getDynamicRules().then((r) => r.length)
    ), { timeout: 5000 }).toBeGreaterThan(0);

    await page.evaluate(() => chrome.storage.local.set({ aiProvider: 'https://claude.ai/' }));
    await expect.poll(async () => serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getDynamicRules()
        .then((rules) => rules.find((r) => r.id === 1)?.condition.requestDomains ?? [])
    ), { timeout: 5000 }).toContain('claude.ai');
  });

  test('every dynamic rule is scoped to pinned domains', async ({ page, serviceWorker, extensionId }) => {
    await openPanel(page, extensionId);

    await page.evaluate(() => globalThis.SidekickFrameRules.sync([
      { url: 'https://chatgpt.com/' },
      { url: 'https://www.instagram.com/' },
      { url: 'https://example.com/' },
    ]));

    const rules = await serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getDynamicRules()
    );

    expect(rules.length).toBeGreaterThan(0);

    for (const rule of rules) {
      // No rule may be a blanket browser-wide matcher any more.
      expect(rule.condition.requestDomains?.length).toBeGreaterThan(0);
      // No rule may rewrite headers for real tabs.
      expect(rule.condition.resourceTypes).not.toContain('main_frame');
    }

    const strip = rules.find((r) => r.id === 1);
    expect(strip.condition.requestDomains).toContain('chatgpt.com');
  });

  test('removes rules when nothing is pinned', async ({ page, serviceWorker, extensionId }) => {
    await openPanel(page, extensionId);

    await page.evaluate(() => globalThis.SidekickFrameRules.sync([{ url: 'https://example.com/' }]));
    let rules = await serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getDynamicRules()
    );
    expect(rules.length).toBeGreaterThan(0);

    await page.evaluate(() => globalThis.SidekickFrameRules.sync([]));
    rules = await serviceWorker.evaluate(() =>
      chrome.declarativeNetRequest.getDynamicRules()
    );
    expect(rules).toEqual([]);
  });
});

test.describe('surface', () => {
  test('nav strip has no Drop or Tools', async ({ page, extensionId }) => {
    await openPanel(page, extensionId);

    await expect(page.locator('#drop-icon')).toHaveCount(0);
    await expect(page.locator('#tools-icon')).toHaveCount(0);
    await expect(page.locator('#search-icon')).toHaveCount(1);
    await expect(page.locator('#home-ai-icon')).toHaveCount(1);
  });

  test('rail icons show a label tooltip on hover', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      pinnedSites: [{ url: 'https://example.com/', title: 'Example Site' }],
    }));
    await openPanel(page, extensionId);

    const icon = page.locator('#pinned-sites-container .app-icon').first();
    const tip = page.locator('#rail-tip');
    await expect(tip).toBeHidden();

    await icon.hover();
    await expect(tip).toBeVisible({ timeout: 3000 });
    await expect(tip).toHaveText('Example Site');

    // Moving off the icon dismisses it again.
    await page.mouse.move(4, 300);
    await expect(tip).toBeHidden({ timeout: 3000 });
  });

  test('static rail buttons carry labels and no native titles', async ({ page, extensionId }) => {
    await openPanel(page, extensionId);

    // Native title= tooltips would double up with the custom label flyout.
    for (const id of ['#home-ai-icon', '#search-icon', '#add-btn', '#settings-btn']) {
      const el = page.locator(id);
      await expect(el).toHaveAttribute('aria-label', /.+/);
      expect(await el.getAttribute('title')).toBeNull();
      expect(await el.getAttribute('data-tip')).toBeTruthy();
    }
  });

  test.describe('instagram boot nudge', () => {
    test('hostname matcher is exact', async ({ page, extensionId }) => {
      await openPanel(page, extensionId);
      const cases = await page.evaluate(() => {
        const f = window.SidekickInstagramNudge.isInstagramUrl;
        return {
          bare: f('https://instagram.com/'),
          www: f('https://www.instagram.com/'),
          deep: f('https://www.instagram.com/p/abc123/'),
          lookalike: f('https://evilinstagram.com/'),
          subdomainAttack: f('https://instagram.com.evil.com/'),
          other: f('https://github.com/'),
          garbage: f('not a url'),
        };
      });
      expect(cases).toEqual({
        bare: true,
        www: true,
        deep: true,
        lookalike: false,
        subdomainAttack: false,
        other: false,
        garbage: false,
      });
    });

    test('non-instagram frames are never fragmented', async ({ page, extensionId }) => {
      const http = require('http');
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><title>Local</title><body>hi</body>');
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${server.address().port}/x`;
      try {
        await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
        await page.evaluate((u) => chrome.storage.local.set({
          aiProviderHasBeenSet: true,
          pinnedSites: [{ url: u, title: 'Local' }],
        }), url);
        await openPanel(page, extensionId);
        await page.locator('#pinned-sites-container .app-icon').first().click();
        // Longer than the nudge delay: the frame must still be fragment-free.
        await page.waitForTimeout(6000);
        const src = await page.$eval('.workspace iframe:not([id])', (f) => f.getAttribute('src'));
        expect(src).toBe(url);
      } finally {
        server.close();
      }
    });
  });

test.describe('frame rule domains', () => {
    test('registrableDomain reduces to eTLD+1 and passes through IPs', async ({ page, extensionId }) => {
      await openPanel(page, extensionId);
      const cases = await page.evaluate(() => {
        const f = globalThis.SidekickFrameRules.registrableDomain;
        return {
          www: f('www.twitch.tv'),
          apex: f('twitch.tv'),
          deep: f('maps.google.com'),
          ip: f('127.0.0.1'),
          localhost: f('localhost'),
          short: f('example.com'),
        };
      });
      expect(cases).toEqual({
        www: 'twitch.tv',
        apex: 'twitch.tv',
        deep: 'google.com',
        ip: '127.0.0.1',
        localhost: 'localhost',
        short: 'example.com',
      });
    });

    test('redirect chains stay inside the ruleset', async ({ page, serviceWorker, extensionId }) => {
      await openPanel(page, extensionId);
      // www.twitch.tv 302s to m.twitch.tv; the registrable domain covers both.
      await page.evaluate(() => globalThis.SidekickFrameRules.sync([
        { url: 'https://www.twitch.tv/' },
      ]));
      const rules = await serviceWorker.evaluate(() =>
        chrome.declarativeNetRequest.getDynamicRules()
      );
      const strip = rules.find((r) => r.id === 1);
      expect(strip.condition.requestDomains).toEqual(['twitch.tv']);

      for (const url of ['https://www.twitch.tv/', 'https://m.twitch.tv/?desktop-redirect=true']) {
        const outcome = await serviceWorker.evaluate((u) =>
          chrome.declarativeNetRequest.testMatchOutcome({
            url: u, type: 'sub_frame', initiator: 'https://x.example/', method: 'get',
          }), url);
        expect(outcome.matchedRules.length, `${url} should match`).toBeGreaterThan(0);
      }
    });
  });

  test.describe('frame isolation', () => {
    test('a framed page cannot navigate the panel away', async ({ page, extensionId }) => {
      // Cloudflare challenge pages break out of frames via top.location.
      // Loading one must never destroy the panel.
      const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<!doctype html><title>bust</title><body>bust<script>try{top.location.href='http://127.0.0.1:9/pwned';}catch(e){}</script>`);
      });
      await new Promise((r) => server.listen(0, '127.0.0.1', r));
      const url = `http://127.0.0.1:${server.address().port}/challenge`;
      try {
        await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
        await page.evaluate((u) => chrome.storage.local.set({
          aiProviderHasBeenSet: true,
          pinnedSites: [{ url: u, title: 'Challenge' }],
        }), url);
        await openPanel(page, extensionId);
        await page.locator('#pinned-sites-container .app-icon').first().click();
        await page.waitForTimeout(3000);
        expect(page.url()).toMatch(/^chrome-extension:\/\//);
        await expect(page.locator('#pinned-sites-container .app-icon')).toHaveCount(1);
      } finally {
        server.close();
      }
    });
  });

  test('no references to removed features remain', async () => {
    const root = path.join(__dirname, '..');

    for (const file of ['sidepanel.js', 'sidepanel.html', 'manifest.json']) {
      const src = fs.readFileSync(path.join(root, file), 'utf8');
      expect(src, `${file} still references removed features`).not.toMatch(
        /drop\.html|tools\.html|drop-icon|tools-icon|local:/
      );
    }

    for (const file of ['drop.html', 'tools.html', 'drop.js', 'tools.js', 'drop.css', 'tools.css', 'rules.json']) {
      expect(fs.existsSync(path.join(root, file)), `${file} should be deleted`).toBe(false);
    }
  });
});