const path = require('path');
const base = require('@playwright/test');

const EXTENSION_PATH = path.join(__dirname, '..');

/**
 * Extensions can only be side-loaded via command line flags, and Chrome/Edge
 * removed --load-extension / --disable-extensions-except. So we drive the
 * Chromium build that ships with Playwright (`channel: 'chromium'`).
 */
const test = base.test.extend({
  context: async ({}, use) => {
    const context = await base.chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });
    await use(context);
    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker.url().split('/')[2]);
  },

  serviceWorker: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(worker);
  },
});

/** Opens the side panel document as a normal tab so it can be driven. */
async function openPanel(page, extensionId) {
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // #app-bar is hidden whenever the AI provider is in front, so wait on the
  // always-visible nav strip instead.
  await page.waitForSelector('#home-ai-icon', { state: 'attached' });
  await page.waitForFunction(() => document.readyState === 'complete');
  return page;
}

/**
 * Opens the panel with the first-run welcome modal already dismissed, so tests
 * can click the nav strip without it swallowing pointer events.
 */
async function openPanelReady(page, extensionId) {
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  await page.evaluate(() => chrome.storage.local.set({ aiProviderHasBeenSet: true }));
  return openPanel(page, extensionId);
}

/** Reads the live cross-origin frames the panel is currently holding open. */
function liveFrames(page) {
  return page.$$eval('iframe', (frames) =>
    frames
      .filter((f) => f.getAttribute('src') && f.getAttribute('src') !== 'about:blank')
      .map((f) => ({ id: f.id || '(cached)', src: f.getAttribute('src') }))
  );
}

module.exports = {
  test,
  expect: base.expect,
  openPanel,
  openPanelReady,
  liveFrames,
  EXTENSION_PATH,
  chromium: base.chromium,
};