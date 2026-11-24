/**
 * Tool and health tests for the Playwright Agent App.
 *
 * No browser is launched and nothing reaches the network: the `playwright` module is a
 * fake (see fake-playwright.ts), `node:child_process` is mocked for the `install` tool,
 * `os.tmpdir()` points at a directory made for this run (recordings are staged there),
 * and `fetch` rejects. Each test asserts the exact calls the tool made on the fake page
 * and the shape of what it returned.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  execFileSync: vi.fn(),
  tmp: { dir: '', real: (): string => '' },
}));

// The app imports `playwright`: give it the fake, never the real browser library.
vi.mock('playwright', async () => (await import('./fake-playwright.js')).playwrightModule);

// `install` runs the Playwright CLI with execFileSync: never run it for real.
vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: mocks.execFileSync,
}));

// `start-recording` stages videos under os.tmpdir(): send it to this run's own directory.
vi.mock('node:os', async (importOriginal) => {
  const os = await importOriginal<typeof import('node:os')>();
  mocks.tmp.real = os.tmpdir;
  return { ...os, tmpdir: () => mocks.tmp.dir || os.tmpdir() };
});

import { activePage, addElement, fake, playwrightModule } from './fake-playwright.js';
import { callTool, errorText, linkOf, objectLinks, objectPuts, runHealthCheck } from './harness.js';

beforeAll(async () => {
  // Importing node:os here runs the mock factory above, which records the real tmpdir.
  await import('node:os');
  mocks.tmp.dir = mkdtempSync(join(mocks.tmp.real(), 'agentapps-playwright-test-'));
});

afterAll(() => {
  rmSync(mocks.tmp.dir, { recursive: true, force: true });
});

beforeEach(() => {
  mocks.execFileSync.mockReset();
  playwrightModule.chromium.launch.mockClear();
});

/** A console message as Playwright hands it to a `console` listener. */
const consoleMessage = (type: string, text: string) => ({ type: () => type, text: () => text });

/** Opens the fake page (any tool that needs the browser does it) and returns it. */
async function openPage() {
  const result = await callTool('navigate', { url: 'https://example.com/' });
  expect(result.success).toBe(true);
  return activePage();
}

describe('health', () => {
  it('reports ready when Chromium launches, and closes that browser again', async () => {
    const health = await runHealthCheck();
    expect(health.status).toBe('ready');
    expect(health.message).toBe('Playwright ready — Chromium available');
    expect(fake.launches).toEqual([{ headless: true }]);
    expect(fake.browsers[0].close).toHaveBeenCalledTimes(1);
  });

  it('reports not_ready with BROWSER_NOT_AVAILABLE when the launch fails', async () => {
    fake.launchError = new Error("Executable doesn't exist at /fake/chromium/chrome");
    const health = await runHealthCheck();
    expect(health.status).toBe('not_ready');
    expect(health.message).toBe('Chromium browser not available');
    expect(health.issues).toEqual([
      {
        code: 'BROWSER_NOT_AVAILABLE',
        message: "Executable doesn't exist at /fake/chromium/chrome",
        severity: 'error',
      },
    ]);
  });
});

describe('navigation', () => {
  it('navigate launches headless Chromium once, opens a 1280x720 page and goes to the URL', async () => {
    const result = await callTool('navigate', { url: 'https://example.com/' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Navigated to https://example.com/\n\nTitle: Example Domain');
    expect(fake.launches).toEqual([
      { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
    ]);
    expect(fake.contexts.map((c) => c.options)).toEqual([
      { viewport: { width: 1280, height: 720 } },
    ]);
    expect(activePage().goto.mock.calls).toEqual([
      ['https://example.com/', { waitUntil: 'domcontentloaded' }],
    ]);

    // A second call reuses the same browser, context and page.
    await callTool('navigate', { url: 'https://example.com/b', waitUntil: 'networkidle' });
    expect(fake.launches).toHaveLength(1);
    expect(fake.pages).toHaveLength(1);
    expect(activePage().goto).toHaveBeenLastCalledWith('https://example.com/b', {
      waitUntil: 'networkidle',
    });
  });

  it('navigate returns the page error (DNS failure, timeout) as a failed result', async () => {
    const page = await openPage();
    page.goto.mockRejectedValueOnce(
      new Error('page.goto: net::ERR_NAME_NOT_RESOLVED at https://nope.invalid/'),
    );
    const result = await callTool('navigate', { url: 'https://nope.invalid/' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('net::ERR_NAME_NOT_RESOLVED');
  });

  it('navigate fails when Chromium is not installed, with the launch error', async () => {
    fake.launchError = new Error("browserType.launch: Executable doesn't exist");
    const result = await callTool('navigate', { url: 'https://example.com/' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain("Executable doesn't exist");
    expect(fake.pages).toHaveLength(0);
  });

  it('navigate-back goes one step back and reports the URL', async () => {
    const page = await openPage();
    const result = await callTool('navigate-back', {});
    expect(result.success).toBe(true);
    expect(page.goBack).toHaveBeenCalledTimes(1);
    expect(result.result).toBe('Navigated back to https://example.com/');
  });

  it('resize sets the viewport of the current page', async () => {
    const result = await callTool('resize', { width: 800, height: 600 });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Resized viewport to 800x600');
    expect(activePage().setViewportSize.mock.calls).toEqual([[{ width: 800, height: 600 }]]);
  });

  it('close closes page, context and browser, and the next tool launches a new one', async () => {
    const page = await openPage();
    const result = await callTool('close', {});
    expect(result.success).toBe(true);
    expect(result.result).toBe('Browser closed');
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(fake.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(fake.browsers[0].close).toHaveBeenCalledTimes(1);

    await callTool('navigate', { url: 'https://example.com/again' });
    expect(fake.launches).toHaveLength(2);
  });

  it('close without an open browser succeeds and launches nothing', async () => {
    const result = await callTool('close', {});
    expect(result.success).toBe(true);
    expect(fake.launches).toHaveLength(0);
  });
});

describe('wait-for', () => {
  it('waits for a time in seconds', async () => {
    const result = await callTool('wait-for', { time: 2 });
    expect(result.result).toBe('Waited 2 seconds');
    expect(activePage().waitForTimeout.mock.calls).toEqual([[2000]]);
  });

  it('waits for a URL with a 30 second timeout', async () => {
    const result = await callTool('wait-for', { url: '**/callback*' });
    expect(result.result).toBe('URL matched: about:blank');
    expect(activePage().waitForURL.mock.calls).toEqual([['**/callback*', { timeout: 30000 }]]);
  });

  it('waits for the network to be idle', async () => {
    const result = await callTool('wait-for', { networkIdle: true });
    expect(result.result).toBe('Network is idle');
    expect(activePage().waitForLoadState.mock.calls).toEqual([['networkidle', { timeout: 30000 }]]);
  });

  it('waits for a text to appear, and for a text to disappear', async () => {
    const appeared = await callTool('wait-for', { text: 'Welcome' });
    expect(appeared.result).toBe('Text "Welcome" appeared');
    const gone = await callTool('wait-for', { textGone: 'Loading' });
    expect(gone.result).toBe('Text "Loading" disappeared');
    expect(activePage().waitForSelector.mock.calls).toEqual([
      ['text=Welcome'],
      ['text=Loading', { state: 'hidden' }],
    ]);
  });

  it('returns the timeout of the page as a failed result', async () => {
    const page = await openPage();
    page.waitForSelector.mockRejectedValueOnce(new Error('page.waitForSelector: Timeout 30000ms'));
    const result = await callTool('wait-for', { text: 'Never' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Timeout 30000ms');
  });

  it('says so when no condition was given', async () => {
    const result = await callTool('wait-for', {});
    expect(result.success).toBe(true);
    expect(result.result).toBe('Nothing to wait for');
  });
});

describe('snapshot and screenshot', () => {
  it('snapshot returns the accessibility tree with the URL and title', async () => {
    await openPage();
    const result = await callTool('snapshot', {});
    expect(result.success).toBe(true);
    const text = String(result.result);
    expect(text).toContain('# Page Accessibility Snapshot');
    expect(text).toContain('URL: https://example.com/');
    expect(text).toContain('Title: Example Domain');
    expect(text).toContain('- button "Submit" [ref=e3]');
    expect(objectPuts).toEqual([]);
  });

  it('snapshot says so when the page has no accessibility tree', async () => {
    fake.snapshot = null;
    const result = await callTool('snapshot', {});
    expect(result.result).toBe('Page has no accessibility tree');
  });

  it('snapshot with a filename stores it as a markdown object and returns a one-hour link', async () => {
    await openPage();
    const result = await callTool('snapshot', { filename: '../../notes/snapshot.md' });
    expect(result.success).toBe(true);
    // Only the base name of the path is used.
    expect(objectPuts).toHaveLength(1);
    expect(objectPuts[0].filename).toBe('snapshot.md');
    expect(objectPuts[0].contentType).toBe('text/markdown');
    expect(objectPuts[0].content.toString('utf8')).toContain('- button "Submit" [ref=e3]');
    expect(objectLinks).toEqual([{ objectId: 'obj_1', expiresIn: 3600 }]);
    expect(result.result).toBe(`Snapshot saved as snapshot.md — ${linkOf('obj_1')}`);
  });

  it('take-screenshot stores a PNG of the viewport and returns it as an attachment', async () => {
    const page = await openPage();
    const result = await callTool('take-screenshot', { filename: 'shots/home.png' });
    expect(result.success).toBe(true);
    expect(page.screenshot.mock.calls).toEqual([[{ type: 'png', fullPage: undefined }]]);
    expect(objectPuts).toHaveLength(1);
    expect(objectPuts[0].filename).toBe('home.png');
    expect(objectPuts[0].contentType).toBe('image/png');
    expect(objectPuts[0].content.toString()).toBe('fake-page-image');
    expect(objectLinks).toEqual([{ objectId: 'obj_1', expiresIn: 3600 }]);
    expect(result.result).toEqual({
      output: `Screenshot saved as home.png — ${linkOf('obj_1')}`,
      attachments: [{ url: linkOf('obj_1'), mime: 'image/png', filename: 'home.png' }],
    });
  });

  it('take-screenshot names the file screenshot-{timestamp}.{type} by default, and passes fullPage', async () => {
    const page = await openPage();
    const result = await callTool('take-screenshot', { type: 'jpeg', fullPage: true });
    expect(result.success).toBe(true);
    expect(page.screenshot.mock.calls).toEqual([[{ type: 'jpeg', fullPage: true }]]);
    expect(objectPuts[0].contentType).toBe('image/jpeg');
    expect(objectPuts[0].filename).toMatch(/^screenshot-\d+\.jpeg$/);
  });

  it('take-screenshot with a ref captures only that element', async () => {
    const page = await openPage();
    const element = addElement('e3');
    const result = await callTool('take-screenshot', { element: 'Submit button', ref: 'e3' });
    expect(result.success).toBe(true);
    expect(page.locator).toHaveBeenCalledWith('aria-ref=e3');
    expect(element.screenshot.mock.calls).toEqual([[{ type: 'png' }]]);
    expect(page.screenshot).not.toHaveBeenCalled();
    expect(objectPuts[0].content.toString()).toBe('fake-element-image');
  });

  // Today a ref that matches nothing is ignored and the whole viewport is captured instead,
  // with no word about it in the result (src/tools/take-screenshot.ts:57-64).
  it.todo('take-screenshot with a ref that matches no element fails instead of capturing the page');
});

describe('page actions (sensitive)', () => {
  it('click clicks the element of the ref with the left button, once', async () => {
    const page = await openPage();
    const element = addElement('e3');
    const result = await callTool('click', { element: 'Submit button', ref: 'e3' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Clicked on "Submit button"');
    expect(page.locator).toHaveBeenCalledWith('aria-ref=e3');
    expect(element.click.mock.calls).toEqual([[{ button: 'left', clickCount: 1 }]]);
  });

  it('click passes double click, button and modifiers', async () => {
    await openPage();
    const element = addElement('s1e12');
    const result = await callTool('click', {
      element: 'Row',
      ref: 's1e12',
      doubleClick: true,
      button: 'right',
      modifiers: ['Shift'],
    });
    expect(result.success).toBe(true);
    expect(element.click.mock.calls).toEqual([
      [{ button: 'right', clickCount: 2, modifiers: ['Shift'] }],
    ]);
  });

  it('click accepts a CSS selector as ref', async () => {
    const page = await openPage();
    const element = addElement('#submit');
    const result = await callTool('click', { element: 'Submit', ref: '#submit' });
    expect(result.success).toBe(true);
    expect(page.$).toHaveBeenCalledWith('#submit');
    expect(element.click).toHaveBeenCalledTimes(1);
  });

  it('click fails with "Element not found" after three attempts when the ref matches nothing', async () => {
    const page = await openPage();
    const result = await callTool('click', { element: 'Ghost', ref: 'e99' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Element not found: e99');
    // Two retries, each after a 500 ms pause.
    expect(page.waitForTimeout.mock.calls).toEqual([[500], [500]]);
  });

  it('click returns the error of the page as a failed result', async () => {
    await openPage();
    const element = addElement('e3');
    element.click.mockRejectedValueOnce(new Error('elementHandle.click: Element is not visible'));
    const result = await callTool('click', { element: 'Submit button', ref: 'e3' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('Element is not visible');
  });

  it('type fills the text at once', async () => {
    await openPage();
    const element = addElement('e5');
    const result = await callTool('type', { element: 'Search box', ref: 'e5', text: 'hello' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Typed "hello" into "Search box"');
    expect(element.fill.mock.calls).toEqual([['hello']]);
    expect(element.type).not.toHaveBeenCalled();
    expect(element.press).not.toHaveBeenCalled();
  });

  it('type with slowly types key by key, and with submit presses Enter', async () => {
    await openPage();
    const element = addElement('e5');
    const result = await callTool('type', {
      element: 'Search box',
      ref: 'e5',
      text: 'hello',
      slowly: true,
      submit: true,
    });
    expect(result.success).toBe(true);
    expect(element.type.mock.calls).toEqual([['hello', { delay: 50 }]]);
    expect(element.fill).not.toHaveBeenCalled();
    expect(element.press.mock.calls).toEqual([['Enter']]);
  });

  it('type fails when the ref matches nothing, and types nowhere', async () => {
    await openPage();
    const result = await callTool('type', { element: 'Ghost', ref: 'e99', text: 'hello' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Element not found: e99');
  });

  it('press-key presses the key on the page keyboard', async () => {
    const result = await callTool('press-key', { key: 'Enter' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Pressed key: Enter');
    expect(activePage().keyboard.press.mock.calls).toEqual([['Enter']]);
  });

  it('select-option selects the given values in the element', async () => {
    await openPage();
    const element = addElement('e7');
    const result = await callTool('select-option', {
      element: 'Country',
      ref: 'e7',
      values: ['es', 'pt'],
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Selected options in "Country"');
    expect(element.selectOption.mock.calls).toEqual([[['es', 'pt']]]);
  });

  it('select-option fails when the ref matches nothing', async () => {
    await openPage();
    const result = await callTool('select-option', { element: 'Ghost', ref: 'e99', values: ['x'] });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Element not found: e99');
  });

  it('drag moves the mouse from the centre of the source to the centre of the target', async () => {
    const page = await openPage();
    addElement('e1').boundingBox.mockResolvedValue({ x: 0, y: 0, width: 100, height: 50 });
    addElement('e2').boundingBox.mockResolvedValue({ x: 200, y: 300, width: 40, height: 20 });
    const result = await callTool('drag', {
      startElement: 'Card',
      startRef: 'e1',
      endElement: 'Done column',
      endRef: 'e2',
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Dragged "Card" to "Done column"');
    expect(page.mouse.move.mock.calls).toEqual([
      [50, 25],
      [220, 310, { steps: 10 }],
    ]);
    expect(page.mouse.down).toHaveBeenCalledTimes(1);
    expect(page.mouse.up).toHaveBeenCalledTimes(1);
  });

  it('drag fails before moving the mouse when the target matches nothing', async () => {
    const page = await openPage();
    addElement('e1');
    const result = await callTool('drag', {
      startElement: 'Card',
      startRef: 'e1',
      endElement: 'Ghost',
      endRef: 'e99',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Target element not found: e99');
    expect(page.mouse.down).not.toHaveBeenCalled();
  });

  it('drag fails when an element has no position (hidden)', async () => {
    const page = await openPage();
    addElement('e1').boundingBox.mockResolvedValue(null);
    addElement('e2');
    const result = await callTool('drag', {
      startElement: 'Card',
      startRef: 'e1',
      endElement: 'Done column',
      endRef: 'e2',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Could not get element positions');
    expect(page.mouse.down).not.toHaveBeenCalled();
  });

  it('fill-form fills each kind of field and reports one line per field', async () => {
    await openPage();
    const name = addElement('e1');
    const terms = addElement('e2');
    const plan = addElement('e3');
    const country = addElement('e4');
    const volume = addElement('e5');
    const result = await callTool('fill-form', {
      fields: [
        { name: 'Name', type: 'textbox', ref: 'e1', value: 'Ada' },
        { name: 'Terms', type: 'checkbox', ref: 'e2', value: 'true' },
        { name: 'Plan', type: 'radio', ref: 'e3', value: 'pro' },
        { name: 'Country', type: 'combobox', ref: 'e4', value: 'Spain' },
        { name: 'Volume', type: 'slider', ref: 'e5', value: '7' },
        { name: 'Ghost', type: 'textbox', ref: 'e99', value: 'x' },
        { name: 'Odd', type: 'colour', ref: 'e1', value: 'x' },
      ],
    });
    expect(result.success).toBe(true);
    expect(String(result.result).split('\n')).toEqual([
      '[OK] Name: filled with "Ada"',
      '[OK] Terms: checked',
      '[OK] Plan: selected',
      '[OK] Country: selected "Spain"',
      '[OK] Volume: set to 7',
      '[FAIL] Ghost: Element not found',
      '[FAIL] Odd: Unknown field type "colour"',
    ]);
    expect(name.fill.mock.calls).toEqual([['Ada']]);
    // The checkbox was unchecked and must be checked: one click.
    expect(terms.click).toHaveBeenCalledTimes(1);
    expect(plan.click).toHaveBeenCalledTimes(1);
    expect(country.selectOption.mock.calls).toEqual([[{ label: 'Spain' }]]);
    expect(volume.evaluate).toHaveBeenCalledTimes(1);
    expect(volume.evaluate.mock.calls[0][1]).toBe('7');
  });

  it('fill-form leaves a checkbox alone when it already has the wanted state', async () => {
    await openPage();
    const terms = addElement('e2');
    terms.isChecked.mockResolvedValue(true);
    const result = await callTool('fill-form', {
      fields: [{ name: 'Terms', type: 'checkbox', ref: 'e2', value: 'true' }],
    });
    expect(result.result).toBe('[OK] Terms: checked');
    expect(terms.click).not.toHaveBeenCalled();
  });

  it('fill-form reports a field the page rejects and goes on with the next one', async () => {
    await openPage();
    addElement('e1').fill.mockRejectedValueOnce(new Error('Element is not an <input>'));
    const email = addElement('e2');
    const result = await callTool('fill-form', {
      fields: [
        { name: 'Name', type: 'textbox', ref: 'e1', value: 'Ada' },
        { name: 'Email', type: 'textbox', ref: 'e2', value: 'ada@example.com' },
      ],
    });
    expect(result.success).toBe(true);
    expect(String(result.result).split('\n')).toEqual([
      '[FAIL] Name: Element is not an <input>',
      '[OK] Email: filled with "ada@example.com"',
    ]);
    expect(email.fill.mock.calls).toEqual([['ada@example.com']]);
  });

  it('evaluate runs the function in the page and returns its result as JSON', async () => {
    const page = await openPage();
    const result = await callTool('evaluate', { function: '() => ({ answer: 6 * 7 })' });
    expect(result.success).toBe(true);
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(typeof page.evaluate.mock.calls[0][0]).toBe('function');
    expect(JSON.parse(String(result.result))).toEqual({ answer: 42 });
  });

  it('evaluate with a ref runs the function on that element', async () => {
    const page = await openPage();
    const element = addElement('e3');
    element.evaluate.mockImplementationOnce(async (fn: (el: unknown) => unknown) =>
      fn({ tagName: 'BUTTON' }),
    );
    const result = await callTool('evaluate', {
      function: '(element) => element.tagName',
      element: 'Submit button',
      ref: 'e3',
    });
    expect(result.success).toBe(true);
    expect(result.result).toBe('"BUTTON"');
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('evaluate returns the exception of the function as a failed result', async () => {
    await openPage();
    const result = await callTool('evaluate', {
      function: '() => { throw new Error("boom in page") }',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('boom in page');
  });

  it('evaluate rejects a function that is not valid JavaScript, and runs nothing', async () => {
    const page = await openPage();
    const result = await callTool('evaluate', { function: '() => {' });
    expect(result.success).toBe(false);
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('evaluate with a ref that matches nothing fails', async () => {
    await openPage();
    const result = await callTool('evaluate', { function: '(e) => e', ref: 'e99' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Element not found: e99');
  });

  it('run-code calls the snippet with { page, context, browser } and returns its result as JSON', async () => {
    const page = await openPage();
    const result = await callTool('run-code', {
      code: 'async ({ page, context, browser }) => { await page.goto("https://example.com/next"); return { url: page.url(), tabs: context.pages().length, connected: browser.isConnected() }; }',
    });
    expect(result.success).toBe(true);
    expect(JSON.parse(String(result.result))).toEqual({
      url: 'https://example.com/next',
      tabs: 1,
      connected: true,
    });
    expect(page.goto).toHaveBeenLastCalledWith('https://example.com/next');
  });

  it('run-code says so when the snippet returns nothing', async () => {
    const result = await callTool('run-code', { code: 'async () => {}' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Code executed successfully (no return value)');
  });

  it('run-code returns the exception of the snippet as a failed result', async () => {
    const result = await callTool('run-code', {
      code: 'async () => { throw new Error("locator.click: Timeout 30000ms exceeded") }',
    });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('locator.click: Timeout 30000ms exceeded');
  });

  it('run-code rejects a snippet that is not valid JavaScript', async () => {
    const result = await callTool('run-code', { code: 'async ({ page }) => {' });
    expect(result.success).toBe(false);
  });

  it('file-upload waits 30 s for a file chooser and sets the files', async () => {
    const page = await openPage();
    const result = await callTool('file-upload', { paths: ['/fake/a.pdf', '/fake/b.pdf'] });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Uploaded 2 file(s): /fake/a.pdf, /fake/b.pdf');
    expect(page.waitForEvent.mock.calls).toEqual([['filechooser', { timeout: 30000 }]]);
    expect(page.fileChooser.setFiles.mock.calls).toEqual([[['/fake/a.pdf', '/fake/b.pdf']]]);
  });

  it('file-upload without paths cancels the file chooser', async () => {
    const page = await openPage();
    const result = await callTool('file-upload', {});
    expect(result.success).toBe(true);
    expect(result.result).toBe('File chooser cancelled');
    expect(page.fileChooser.setFiles.mock.calls).toEqual([[[]]]);
  });

  it('file-upload fails when no file chooser opens in time', async () => {
    const page = await openPage();
    page.waitForEvent.mockRejectedValueOnce(
      new Error(
        'page.waitForEvent: Timeout 30000ms exceeded while waiting for event "filechooser"',
      ),
    );
    const result = await callTool('file-upload', { paths: ['/fake/a.pdf'] });
    expect(result.success).toBe(false);
    expect(errorText(result)).toContain('waiting for event "filechooser"');
    expect(page.fileChooser.setFiles).not.toHaveBeenCalled();
  });

  it('handle-dialog arms a one-time handler that accepts the next dialog with the prompt text', async () => {
    const page = await openPage();
    const result = await callTool('handle-dialog', { accept: true, promptText: 'yes please' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Dialog handler set: accept');
    expect(page.once).toHaveBeenCalledWith('dialog', expect.any(Function));

    const dialog = { accept: vi.fn(async () => {}), dismiss: vi.fn(async () => {}) };
    await page.emit('dialog', dialog);
    expect(dialog.accept.mock.calls).toEqual([['yes please']]);
    expect(dialog.dismiss).not.toHaveBeenCalled();
  });

  it('handle-dialog with accept false dismisses the next dialog', async () => {
    const page = await openPage();
    const result = await callTool('handle-dialog', { accept: false });
    expect(result.result).toBe('Dialog handler set: dismiss');
    const dialog = { accept: vi.fn(async () => {}), dismiss: vi.fn(async () => {}) };
    await page.emit('dialog', dialog);
    expect(dialog.dismiss).toHaveBeenCalledTimes(1);
    expect(dialog.accept).not.toHaveBeenCalled();
  });

  it('install runs the Playwright CLI of the app with the current node, for Chromium only', async () => {
    const result = await callTool('install', {});
    expect(result.success).toBe(true);
    expect(result.result).toBe('Chromium browser installed successfully');
    expect(mocks.execFileSync).toHaveBeenCalledTimes(1);
    const [command, args, options] = mocks.execFileSync.mock.calls[0];
    expect(command).toBe(process.execPath);
    expect(args).toHaveLength(3);
    expect(String(args[0])).toMatch(/[\\/]playwright[\\/]cli\.js$/);
    expect(args.slice(1)).toEqual(['install', 'chromium']);
    expect(options).toEqual({ stdio: 'inherit' });
    // It launches no browser.
    expect(fake.launches).toHaveLength(0);
  });

  it('install returns the failure of the CLI as a failed result', async () => {
    mocks.execFileSync.mockImplementationOnce(() => {
      throw new Error('Command failed: download interrupted');
    });
    const result = await callTool('install', {});
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe(
      'Failed to install browser: Error: Command failed: download interrupted',
    );
  });
});

describe('hover', () => {
  it('hovers over the element of the ref', async () => {
    await openPage();
    const element = addElement('e3');
    const result = await callTool('hover', { element: 'Menu', ref: 'e3' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Hovered over "Menu"');
    expect(element.hover).toHaveBeenCalledTimes(1);
  });

  it('fails when the ref matches nothing', async () => {
    await openPage();
    const result = await callTool('hover', { element: 'Ghost', ref: 'e99' });
    expect(result.success).toBe(false);
    expect(errorText(result)).toBe('Element not found: e99');
  });
});

describe('tabs', () => {
  it('lists the tabs and marks the active one', async () => {
    await openPage();
    const result = await callTool('tabs', { action: 'list' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('0: https://example.com/ (active)');
  });

  it('opens a new tab and makes it the active one', async () => {
    const first = await openPage();
    const created = await callTool('tabs', { action: 'new' });
    expect(created.success).toBe(true);
    expect(String(created.result)).toMatch(/^Created new tab \(\d+ tabs total\)$/);
    expect(fake.contexts[0].newPage).toHaveBeenCalledTimes(2);

    const list = await callTool('tabs', { action: 'list' });
    expect(String(list.result).split('\n')).toEqual([
      '0: https://example.com/ ',
      '1: about:blank (active)',
    ]);
    // Later tools act on the new tab.
    await callTool('navigate', { url: 'https://example.com/second' });
    expect(first.goto).toHaveBeenCalledTimes(1);
    expect(activePage().goto).toHaveBeenCalledWith('https://example.com/second', {
      waitUntil: 'domcontentloaded',
    });
  });

  // Today the message counts the tabs before the new one is opened: with one tab open it
  // says "(1 tabs total)" although there are now two (src/tools/tabs.ts:45).
  it.todo('tabs new reports the number of tabs after the new one was opened');

  it('selects a tab by index and brings it to the front', async () => {
    const first = await openPage();
    await callTool('tabs', { action: 'new' });
    const result = await callTool('tabs', { action: 'select', index: 0 });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Selected tab 0: https://example.com/');
    expect(first.bringToFront).toHaveBeenCalledTimes(1);
    const list = await callTool('tabs', { action: 'list' });
    expect(String(list.result).split('\n')[0]).toBe('0: https://example.com/ (active)');
  });

  it('closes a tab by index and keeps the active one', async () => {
    const first = await openPage();
    await callTool('tabs', { action: 'new' });
    const result = await callTool('tabs', { action: 'close', index: 0 });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Closed tab 0');
    expect(first.close).toHaveBeenCalledTimes(1);
    const list = await callTool('tabs', { action: 'list' });
    expect(result.success).toBe(true);
    expect(list.result).toBe('0: about:blank (active)');
  });

  it('closes the current tab when no index is given', async () => {
    await openPage();
    await callTool('tabs', { action: 'new' });
    const second = activePage();
    const result = await callTool('tabs', { action: 'close' });
    expect(result.result).toBe('Closed tab 1');
    expect(second.close).toHaveBeenCalledTimes(1);
    const list = await callTool('tabs', { action: 'list' });
    expect(list.result).toBe('0: https://example.com/ (active)');
  });

  // Today, closing the active tab when it is tab 0 makes the closed tab the current page
  // (`pages` was read before the close), so the next tool opens a blank tab instead of
  // moving to a tab that is still open (src/tools/tabs.ts:52-54).
  it.todo('tabs close of the active tab 0 moves to a tab that is still open');

  it('answers "Invalid tab index" for an index out of range, and closes nothing', async () => {
    const page = await openPage();
    const closed = await callTool('tabs', { action: 'close', index: 5 });
    expect(closed.success).toBe(true);
    expect(closed.result).toBe('Invalid tab index');
    const selected = await callTool('tabs', { action: 'select', index: -1 });
    expect(selected.result).toBe('Invalid tab index');
    expect(page.close).not.toHaveBeenCalled();
  });

  it('answers "Unknown action" for an action it does not know', async () => {
    const result = await callTool('tabs', { action: 'duplicate' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Unknown action');
  });
});

describe('console and network buffers (read-only)', () => {
  it('console-messages returns what the page logged, filtered by level', async () => {
    const page = await openPage();
    await page.emit('console', consoleMessage('error', 'Uncaught TypeError: x is undefined'));
    await page.emit('console', consoleMessage('warning', 'Deprecated API'));
    await page.emit('console', consoleMessage('info', 'App started'));
    await page.emit('console', consoleMessage('debug', 'render 12ms'));

    const info = JSON.parse(String((await callTool('console-messages', {})).result));
    expect(info.messages.map((m: { level: string; text: string }) => [m.level, m.text])).toEqual([
      ['ERROR', 'Uncaught TypeError: x is undefined'],
      ['WARNING', 'Deprecated API'],
      ['INFO', 'App started'],
    ]);
    expect(info).toMatchObject({ count: 3, total: 3, hasMore: false });
    expect(typeof info.lastTimestamp).toBe('number');

    const errors = JSON.parse(
      String((await callTool('console-messages', { level: 'error' })).result),
    );
    expect(errors.messages.map((m: { text: string }) => m.text)).toEqual([
      'Uncaught TypeError: x is undefined',
    ]);
  });

  // Playwright reports console.log() as type "log", which is not in the tool's level list,
  // so a "log" message passes every level filter: level "error" returns it too
  // (src/tools/console-messages.ts:61-78).
  it.todo('console-messages with level "error" leaves out console.log() messages');

  it('console-messages pages with limit and offset, and searches without case', async () => {
    const page = await openPage();
    for (const text of ['Alpha one', 'beta two', 'ALPHA three']) {
      await page.emit('console', consoleMessage('info', text));
    }
    const firstPage = JSON.parse(String((await callTool('console-messages', { limit: 2 })).result));
    expect(firstPage).toMatchObject({ count: 2, total: 3, hasMore: true });
    const secondPage = JSON.parse(
      String((await callTool('console-messages', { limit: 2, offset: 2 })).result),
    );
    expect(secondPage.messages.map((m: { text: string }) => m.text)).toEqual(['ALPHA three']);
    expect(secondPage.hasMore).toBe(false);

    const found = JSON.parse(
      String((await callTool('console-messages', { search: 'alpha' })).result),
    );
    expect(found.messages.map((m: { text: string }) => m.text)).toEqual([
      'Alpha one',
      'ALPHA three',
    ]);
  });

  it('console-messages with nothing captured returns an empty list and launches no browser', async () => {
    const result = await callTool('console-messages', {});
    expect(result.success).toBe(true);
    expect(JSON.parse(String(result.result))).toMatchObject({
      messages: [],
      count: 0,
      total: 0,
      hasMore: false,
    });
    expect(fake.launches).toHaveLength(0);
  });

  it('console-errors returns only the errors', async () => {
    const page = await openPage();
    await page.emit('console', consoleMessage('error', 'Failed to load resource: 500'));
    await page.emit('console', consoleMessage('warning', 'Deprecated API'));
    await page.emit('console', consoleMessage('error', 'Uncaught ReferenceError'));

    const all = JSON.parse(String((await callTool('console-errors', {})).result));
    expect(all.errors.map((e: { text: string }) => e.text)).toEqual([
      'Failed to load resource: 500',
      'Uncaught ReferenceError',
    ]);
    expect(all).toMatchObject({ count: 2, total: 2 });

    const one = JSON.parse(
      String((await callTool('console-errors', { search: 'REFERENCE' })).result),
    );
    expect(one.errors.map((e: { text: string }) => e.text)).toEqual(['Uncaught ReferenceError']);

    const limited = JSON.parse(String((await callTool('console-errors', { limit: 1 })).result));
    expect(limited).toMatchObject({ count: 1, total: 2 });
  });

  it('console-errors with no error returns an empty list', async () => {
    const result = await callTool('console-errors', {});
    expect(JSON.parse(String(result.result))).toEqual({ errors: [], count: 0, total: 0 });
  });

  it('console-clear empties the buffer and says how many messages it dropped', async () => {
    const page = await openPage();
    await page.emit('console', consoleMessage('error', 'one'));
    await page.emit('console', consoleMessage('info', 'two'));
    const cleared = await callTool('console-clear', {});
    expect(cleared.success).toBe(true);
    expect(JSON.parse(String(cleared.result))).toEqual({
      cleared: 2,
      message: 'Cleared 2 console messages',
    });
    const after = JSON.parse(String((await callTool('console-messages', {})).result));
    expect(after.total).toBe(0);
  });

  it('network-requests lists the requests of the page without static resources', async () => {
    const page = await openPage();
    const request = (url: string, method: string, resourceType: string) => ({
      url: () => url,
      method: () => method,
      resourceType: () => resourceType,
    });
    await page.emit('request', request('https://example.com/', 'GET', 'document'));
    await page.emit('request', request('https://example.com/logo.png', 'GET', 'image'));
    await page.emit('request', request('https://example.com/api/items', 'POST', 'fetch'));
    await page.emit('response', { url: () => 'https://example.com/', status: () => 200 });
    await page.emit('response', { url: () => 'https://example.com/logo.png', status: () => 200 });

    const result = await callTool('network-requests', {});
    expect(result.success).toBe(true);
    expect(String(result.result).split('\n')).toEqual([
      'GET https://example.com/ -> 200',
      'POST https://example.com/api/items -> pending',
    ]);

    const withStatic = await callTool('network-requests', { includeStatic: true });
    expect(String(withStatic.result).split('\n')).toEqual([
      'GET https://example.com/ -> 200',
      'GET https://example.com/logo.png -> 200',
      'POST https://example.com/api/items -> pending',
    ]);
  });

  it('network-requests with nothing captured says so and launches no browser', async () => {
    const result = await callTool('network-requests', {});
    expect(result.result).toBe('No network requests');
    expect(fake.launches).toHaveLength(0);
  });
});

describe('emulate-device', () => {
  it('replaces the context with the preset of the device', async () => {
    const first = await openPage();
    const result = await callTool('emulate-device', { device: 'iphone-13' });
    expect(result.success).toBe(true);
    expect(result.result).toBe('Device emulation set to "iphone-13" (390x844, mobile, touch).');
    // The old page and context are closed, the browser is kept.
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(fake.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(fake.launches).toHaveLength(1);
    expect(fake.contexts).toHaveLength(2);
    expect(fake.contexts[1].options).toEqual({
      viewport: { width: 390, height: 844 },
      userAgent: expect.stringContaining('iPhone'),
      isMobile: true,
      hasTouch: true,
    });
    // The next tool acts on a page of the new context, which collects console messages.
    await callTool('navigate', { url: 'https://example.com/mobile' });
    expect(fake.contexts[1].openPages).toContain(activePage());
    await activePage().emit('console', consoleMessage('error', 'mobile error'));
    const errors = JSON.parse(String((await callTool('console-errors', {})).result));
    expect(errors.count).toBe(1);
  });

  it('uses a custom viewport when no device is given, 1280x720 by default', async () => {
    const custom = await callTool('emulate-device', { width: 1024, height: 768, hasTouch: true });
    expect(custom.result).toBe('Device emulation set to "custom" (1024x768, touch).');
    expect(fake.contexts[0].options).toEqual({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
    });
    const byDefault = await callTool('emulate-device', {});
    expect(byDefault.result).toBe('Device emulation set to "custom" (1280x720).');
  });

  // Today the new context ends up with two tabs: ensureBrowser() already opens a page in it
  // and the tool then opens a second one and uses that (src/tools/emulate-device.ts:110-112;
  // the same in src/tools/start-recording.ts:67-74, where the first tab also gets a video).
  it.todo('emulate-device and start-recording leave exactly one tab in the new context');
});

describe('recording', () => {
  it('start-recording replaces the context with one that records video into the temp directory', async () => {
    const first = await openPage();
    const result = await callTool('start-recording', { width: 800, height: 600 });
    expect(result.success).toBe(true);
    expect(result.result).toBe(
      'Video recording started (800x600). Call stop-recording to finalize and get the video URL.',
    );
    const videoDir = join(mocks.tmp.dir, 'agentapps-playwright', 'videos');
    expect(existsSync(videoDir)).toBe(true);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(fake.contexts[0].close).toHaveBeenCalledTimes(1);
    expect(fake.contexts[1].options).toEqual({
      viewport: { width: 800, height: 600 },
      recordVideo: { dir: videoDir, size: { width: 800, height: 600 } },
    });
  });

  it('start-recording records at 1280x720 by default', async () => {
    const result = await callTool('start-recording', {});
    expect(result.success).toBe(true);
    expect(fake.contexts[0].options).toMatchObject({
      viewport: { width: 1280, height: 720 },
      recordVideo: { size: { width: 1280, height: 720 } },
    });
  });

  it('stop-recording stores the video as an object, deletes the staging file and returns a link', async () => {
    await callTool('start-recording', {});
    const recordingContext = fake.contexts[0];
    const staged = join(mocks.tmp.dir, 'agentapps-playwright', 'videos', 'fake-recording.webm');
    writeFileSync(staged, 'fake-webm-bytes');
    fake.videoFile = staged;

    const result = await callTool('stop-recording', { filename: 'demos/tour' });
    expect(result.success).toBe(true);
    // Closing the context is what finalizes the video.
    expect(recordingContext.close).toHaveBeenCalledTimes(1);
    expect(objectPuts).toHaveLength(1);
    expect(objectPuts[0].filename).toBe('tour.webm');
    expect(objectPuts[0].contentType).toBe('video/webm');
    expect(objectPuts[0].content.toString()).toBe('fake-webm-bytes');
    expect(objectLinks).toEqual([{ objectId: 'obj_1', expiresIn: 3600 }]);
    expect(existsSync(staged)).toBe(false);
    expect(result.result).toEqual({
      output: `Video saved as tour.webm — ${linkOf('obj_1')}`,
      videoPath: 'tour.webm',
      videoUrl: linkOf('obj_1'),
    });
    // A fresh context without recording keeps the browser usable.
    expect(fake.contexts).toHaveLength(2);
    expect(fake.contexts[1].options).toEqual({ viewport: { width: 1280, height: 720 } });

    const again = await callTool('stop-recording', {});
    expect(again.result).toBe('No active recording to stop.');
    expect(objectPuts).toHaveLength(1);
  });

  it('stop-recording names the object after the staging file when no filename is given', async () => {
    await callTool('start-recording', {});
    const staged = join(mocks.tmp.dir, 'agentapps-playwright', 'videos', 'a1b2c3.webm');
    writeFileSync(staged, 'fake-webm-bytes');
    fake.videoFile = staged;
    const result = await callTool('stop-recording', {});
    expect(result.success).toBe(true);
    expect(objectPuts[0].filename).toBe('a1b2c3.webm');
  });

  it('stop-recording without a video path stores nothing and says so', async () => {
    await callTool('start-recording', {});
    fake.videoFile = null;
    const result = await callTool('stop-recording', {});
    expect(result.success).toBe(true);
    expect(result.result).toBe('Recording stopped but video path could not be determined.');
    expect(objectPuts).toEqual([]);
  });

  it('stop-recording without a recording does nothing and launches no browser', async () => {
    const result = await callTool('stop-recording', {});
    expect(result.success).toBe(true);
    expect(result.result).toBe('No active recording to stop.');
    expect(fake.launches).toHaveLength(0);
  });
});

describe('arguments', () => {
  // Today no tool checks its arguments. A missing required one reaches the browser first:
  // `navigate` without `url` launches Chromium and calls page.goto(undefined)
  // (src/tools/navigate.ts:37), `fill-form` without `fields` launches Chromium and then
  // fails with "fields is not iterable" (src/tools/fill-form.ts:58), `press-key` without
  // `key` calls keyboard.press(undefined) (src/tools/press-key.ts:28).
  it.todo(
    'a missing required argument is rejected with a clear message before the browser is used',
  );
});

describe('no network', () => {
  it('no tool reaches fetch', async () => {
    await openPage();
    await callTool('snapshot', {});
    await callTool('take-screenshot', {});
    expect(fetch).not.toHaveBeenCalled();
  });
});
