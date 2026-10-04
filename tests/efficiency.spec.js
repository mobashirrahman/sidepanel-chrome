const http = require('http');
const { test, expect, openPanel, openPanelReady } = require('./fixtures');

/**
 * Counts work the panel itself does, so assertions are on behaviour rather than
 * on the shape of the source.
 *
 * Layout reads are attributed by caller: Playwright's injected actionability
 * script also calls getBoundingClientRect() while walking the DOM, and that is
 * not the panel's cost. Only frames from sidepanel.js are counted.
 */
const COUNTER = `
  window.__counts = { panelRect: 0, domRebuild: 0 };
  window.__patched = { panelRect: false, domRebuild: false };
  try {
    const origRect = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const stack = new Error().stack;
      if (stack.indexOf('sidepanel.js') !== -1) window.__counts.panelRect++;
      return origRect.apply(this, arguments);
    };
    window.__patched.panelRect = true;
  } catch (e) {}
  try {
    const origCreate = Document.prototype.createElement;
    Document.prototype.createElement = function (tag) {
      const t = String(tag).toLowerCase();
      if (t === 'div' || t === 'img' || t === 'button') window.__counts.domRebuild++;
      return origCreate.apply(this, arguments);
    };
    window.__patched.domRebuild = true;
  } catch (e) {}
`;

/**
 * Instruments the already-loaded panel. Every test resets its counters after
 * load, so patching here rather than via addInitScript is equivalent and avoids
 * depending on init-script timing.
 */
async function instrument(page) {
  await page.evaluate(`(() => {${COUNTER}})()`);
  const patched = await page.evaluate(() => window.__patched);
  for (const [key, ok] of Object.entries(patched)) {
    expect(ok, `instrumentation hook not applied: ${key}`).toBe(true);
  }
}

async function reset(page) {
  await page.evaluate(() => {
    window.__counts.panelRect = 0;
    window.__counts.domRebuild = 0;
  });
}

async function counts(page) {
  return page.evaluate(() => window.__counts);
}

/** Local page server so switching sites costs no network and stays fast. */
async function serveSites(count) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><title>${req.url}</title><body>${req.url}</body>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    urls: Array.from({ length: count }, (_, i) => `http://127.0.0.1:${port}/site-${i}`),
    close: () => server.close(),
  };
}

test.describe('split-view drag', () => {
  test('measures layout once per drag, not once per pointer event', async ({ page, extensionId }) => {
    const sites = await serveSites(1);
    try {
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await page.evaluate((pinned) => chrome.storage.local.set({
        aiProviderHasBeenSet: true,
        pinnedSites: pinned,
      }), [{ url: sites.urls[0], title: 'Local' }]);
      await openPanel(page, extensionId);
      await instrument(page);

      // The app bar (and so the split button) only shows for non-AI views.
      await page.locator('#pinned-sites-container .app-icon').first().click();
      await expect(page.locator('#app-bar')).toBeVisible();

      await page.click('#bar-split');
      await expect(page.locator('#split-divider')).toBeVisible();

      const box = await page.locator('#split-divider').boundingBox();
      await reset(page);

      const EVENTS = 30;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= EVENTS; i++) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - i * 4);
      }
      await page.mouse.up();

      const { panelRect } = await counts(page);
      // Before the fix every mousemove forced a synchronous layout.
      expect(panelRect).toBeLessThan(20);
    } finally {
      sites.close();
    }
  });

  test('split view still resizes the primary workspace', async ({ page, extensionId }) => {
    const sites = await serveSites(1);
    try {
      await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
      await page.evaluate((pinned) => chrome.storage.local.set({
        aiProviderHasBeenSet: true,
        pinnedSites: pinned,
      }), [{ url: sites.urls[0], title: 'Local' }]);
      await openPanel(page, extensionId);

      await page.locator('#pinned-sites-container .app-icon').first().click();
      await page.click('#bar-split');

      // Synthetic events, dispatched deterministically: driving a 2px target
      // through real mouse coordinates is a hit-test lottery, and that is a
      // property of the test environment, not of the drag logic.
      await page.evaluate(() => {
        const divider = document.getElementById('split-divider');
        const r = divider.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        divider.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: cx, clientY: cy }));
        document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy - 200 }));
        document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      });

      // Style writes are coalesced into requestAnimationFrame, so wait a frame.
      await page.waitForFunction(
        () => document.getElementById('primary-workspace').style.flex !== '',
        null,
        { timeout: 3000 }
      );

      const flex = await page.$eval('#primary-workspace', (el) => el.style.flex);
      expect(flex).toMatch(/^0 0 \d+px$/);
    } finally {
      sites.close();
    }
  });
});

test.describe('pin picker search', () => {
  test('render count does not scale with keystrokes', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    // Pin something first so startup does not write default pins mid-measurement.
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      pinnedSites: [{ url: 'https://example.com/', title: 'Example' }],
    }));
    await openPanel(page, extensionId);
    await instrument(page);
    await page.waitForTimeout(400);

    await page.click('#add-btn');
    await expect(page.locator('#pin-picker')).toBeVisible();
    await page.waitForTimeout(400);
    await reset(page);

    // Dispatched in one synchronous burst, the way fast typing arrives. Separate
    // page.fill() calls are seconds apart and would defeat any debounce.
    await page.evaluate(() => {
      const field = document.getElementById('pin-picker-search');
      for (const q of ['gi', 'git', 'gith', 'githu', 'github', 'githu', 'gith', 'git']) {
        field.value = q;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(500);

    const { domRebuild } = await counts(page);
    // Eight input events must not cost eight rebuilds.
    expect(domRebuild).toBeLessThanOrEqual(1);
  });

  test('the debounced search still lands on the right results', async ({ page, extensionId }) => {
    await openPanelReady(page, extensionId);
    await page.click('#add-btn');

    await page.evaluate(() => {
      const field = document.getElementById('pin-picker-search');
      for (const q of ['g', 'gi', 'git', 'gith', 'githu', 'github']) {
        field.value = q;
        field.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(400);

    const names = await page.locator('#discover-list .discover-name').allTextContents();
    expect(names.join(' ').toLowerCase()).toContain('github');
  });

  test('search still filters results', async ({ page, extensionId }) => {
    await openPanelReady(page, extensionId);
    await page.click('#add-btn');

    const total = await page.locator('#discover-list .discover-item').count();
    expect(total).toBeGreaterThan(0);

    await page.fill('#pin-picker-search', 'github');
    await page.waitForTimeout(300);

    const names = await page.locator('#discover-list .discover-name').allTextContents();
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(total);
    expect(names.join(' ').toLowerCase()).toContain('github');
  });

  test('already-pinned sites are marked and not re-addable', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      pinnedSites: [{ url: 'https://github.com/', title: 'GitHub' }],
    }));
    await openPanel(page, extensionId);

    await page.click('#add-btn');
    await page.fill('#pin-picker-search', 'github');
    await page.waitForTimeout(300);

    const row = page.locator('#discover-list .discover-item', { hasText: 'GitHub' }).first();
    await expect(row.locator('.discover-pin-btn')).toHaveClass(/pinned/);
    await expect(row.locator('.discover-pin-btn')).toHaveText('✓');
  });

  test('adding from the picker updates the pinned state', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      pinnedSites: [],
    }));
    await openPanel(page, extensionId);

    await page.click('#add-btn');
    await page.fill('#pin-picker-search', 'stack overflow');
    await page.waitForTimeout(300);

    await page.locator('#discover-list .discover-item').first().click();
    await page.waitForTimeout(400);

    const pinned = await page.evaluate(() =>
      chrome.storage.local.get('pinnedSites').then((r) => r.pinnedSites)
    );
    expect(pinned.map((s) => s.url)).toContain('https://stackoverflow.com/');
  });
});

test.describe('nav strip renders', () => {
  test('adding one site rebuilds the strip once', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      pinnedSites: [],
    }));
    await openPanel(page, extensionId);
    await instrument(page);
    await page.waitForTimeout(400);
    await reset(page);

    await page.evaluate(() => new Promise((resolve) => {
      chrome.storage.local.set({ pinnedSites: [{ url: 'https://example.com/', title: 'Example' }] }, resolve);
    }));
    await page.waitForTimeout(400);

    await expect(page.locator('#pinned-sites-container .app-icon')).toHaveCount(1);

    const { domRebuild } = await counts(page);
    // One icon plus its favicon img, from a single rebuild.
    expect(domRebuild).toBeLessThanOrEqual(2);
  });

  test('deleting a site rebuilds the strip once, not twice', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      pinnedSites: [
        { url: 'https://a.example/', title: 'A' },
        { url: 'https://b.example/', title: 'B' },
      ],
    }));
    await openPanel(page, extensionId);
    await instrument(page);
    await page.waitForTimeout(600);
    await reset(page);

    // Right-click opens the in-panel confirm (no native dialogs involved).
    await page.evaluate(() => {
      const icon = [...document.querySelectorAll('#pinned-sites-container .app-icon')]
        .find((i) => i.dataset.url === 'https://a.example/');
      icon.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    const modal = page.locator('#confirm-modal');
    await expect(modal).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#confirm-message')).toHaveText('Remove this pinned site?');

    // deletePin() renders explicitly, and the write also fires onChanged, which
    // renders again. The signature guard collapses that into one rebuild.
    await page.click('#confirm-ok');
    await expect(page.locator('#pinned-sites-container .app-icon')).toHaveCount(1);

    const { domRebuild } = await counts(page);
    // Two rebuilds would be 4 nodes; a single rebuild is 2.
    expect(domRebuild).toBeLessThanOrEqual(2);
  });

  test('cancelling the confirm keeps the site', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(() => chrome.storage.local.set({
      aiProviderHasBeenSet: true,
      pinnedSites: [{ url: 'https://a.example/', title: 'A' }],
    }));
    await openPanel(page, extensionId);
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      document.querySelector('#pinned-sites-container .app-icon')
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#confirm-modal')).toBeVisible({ timeout: 3000 });

    await page.click('#confirm-cancel');
    await expect(page.locator('#confirm-modal')).toBeHidden();
    await expect(page.locator('#pinned-sites-container .app-icon')).toHaveCount(1);

    const pinned = await page.evaluate(() =>
      chrome.storage.local.get('pinnedSites').then((r) => r.pinnedSites));
    expect(pinned).toHaveLength(1);
  });

  test('hiding a default app asks first, then hides', async ({ page, extensionId }) => {
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await page.evaluate(() => chrome.storage.local.set({ aiProviderHasBeenSet: true }));
    await openPanel(page, extensionId);
    await page.waitForTimeout(600);

    await page.evaluate(() => {
      document.querySelector('#search-icon')
        .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await expect(page.locator('#confirm-modal')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#confirm-message')).toContainText('Hide Search from sidebar?');

    await page.click('#confirm-ok');
    await expect(page.locator('#search-icon')).toBeHidden();
  });
});