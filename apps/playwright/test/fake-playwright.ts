/**
 * A fake `playwright` module for the tests: no browser is ever launched.
 *
 * `chromium.launch()` returns a fake browser whose contexts, pages and elements are plain
 * objects with `vi.fn()` methods, so a test can assert the exact calls a tool made. The
 * `fake` object holds everything that was created and the knobs a test can turn (which
 * refs resolve to an element, whether the launch fails, what the page snapshot says).
 */

import { type Mock, vi } from 'vitest';

type Listener = (payload: unknown) => unknown;

export interface FakeElement {
  click: Mock;
  fill: Mock;
  type: Mock;
  press: Mock;
  hover: Mock;
  selectOption: Mock;
  isChecked: Mock;
  evaluate: Mock;
  boundingBox: Mock;
  screenshot: Mock;
}

export interface FakeFileChooser {
  setFiles: Mock;
}

export interface FakePage {
  closed: boolean;
  currentUrl: string;
  listeners: Map<string, Listener[]>;
  /** Fires a page event (`console`, `request`, `response`, `dialog`) at the app's listeners. */
  emit(event: string, payload: unknown): Promise<void>;
  fileChooser: FakeFileChooser;
  isClosed: Mock;
  close: Mock;
  on: Mock;
  once: Mock;
  goto: Mock;
  goBack: Mock;
  title: Mock;
  url: Mock;
  setViewportSize: Mock;
  evaluate: Mock;
  screenshot: Mock;
  waitForEvent: Mock;
  waitForTimeout: Mock;
  waitForURL: Mock;
  waitForLoadState: Mock;
  waitForSelector: Mock;
  locator: Mock;
  $: Mock;
  getByText: Mock;
  getByRole: Mock;
  bringToFront: Mock;
  video: Mock;
  context: Mock;
  _snapshotForAI: Mock;
  keyboard: { press: Mock };
  mouse: { move: Mock; down: Mock; up: Mock };
}

export interface FakeContext {
  options: Record<string, unknown>;
  openPages: FakePage[];
  newPage: Mock;
  pages: Mock;
  close: Mock;
  newCDPSession: Mock;
}

export interface FakeBrowser {
  connected: boolean;
  isConnected: Mock;
  newContext: Mock;
  close: Mock;
}

export const fake = {
  /** Options of every `chromium.launch()` call. */
  launches: [] as Array<Record<string, unknown>>,
  browsers: [] as FakeBrowser[],
  contexts: [] as FakeContext[],
  pages: [] as FakePage[],
  /** Elements the page can find, by snapshot ref (`e3`) or CSS selector. */
  elements: new Map<string, FakeElement>(),
  /** When set, `chromium.launch()` rejects with it (Chromium not installed). */
  launchError: null as Error | null,
  /** What `page._snapshotForAI()` answers. */
  snapshot: { full: '- button "Submit" [ref=e3]' } as { full?: string } | null,
  /** Path `page.video().path()` answers, or null for a page without a video. */
  videoFile: null as string | null,
  /** What `page.title()` answers. */
  title: 'Example Domain',
};

export function resetFake(): void {
  fake.launches.length = 0;
  fake.browsers.length = 0;
  fake.contexts.length = 0;
  fake.pages.length = 0;
  fake.elements.clear();
  fake.launchError = null;
  fake.snapshot = { full: '- button "Submit" [ref=e3]' };
  fake.videoFile = null;
  fake.title = 'Example Domain';
}

/** Registers an element the fake page finds under `ref`, and returns it. */
export function addElement(ref: string): FakeElement {
  const element: FakeElement = {
    click: vi.fn(async () => {}),
    fill: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    press: vi.fn(async () => {}),
    hover: vi.fn(async () => {}),
    selectOption: vi.fn(async () => []),
    isChecked: vi.fn(async () => false),
    evaluate: vi.fn(async () => 'element-result'),
    boundingBox: vi.fn(async () => ({ x: 10, y: 20, width: 100, height: 40 })),
    screenshot: vi.fn(async () => Buffer.from('fake-element-image')),
  };
  fake.elements.set(ref, element);
  return element;
}

/** A locator-like object that resolves to `element`, or fails like a real timeout. */
function handleOf(element: FakeElement | undefined) {
  const elementHandle = vi.fn(async () => {
    if (!element) throw new Error('Timeout 2000ms exceeded.');
    return element;
  });
  return {
    waitFor: vi.fn(async () => {
      if (!element) throw new Error('Timeout 3000ms exceeded.');
    }),
    first: vi.fn(() => ({ elementHandle })),
  };
}

function makePage(context: FakeContext): FakePage {
  const listeners = new Map<string, Listener[]>();
  const addListener = (event: string, listener: Listener) => {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
  };
  const page: FakePage = {
    closed: false,
    currentUrl: 'about:blank',
    listeners,
    async emit(event, payload) {
      for (const listener of listeners.get(event) ?? []) await listener(payload);
    },
    fileChooser: { setFiles: vi.fn(async () => {}) },
    isClosed: vi.fn(() => page.closed),
    close: vi.fn(async () => {
      page.closed = true;
      context.openPages = context.openPages.filter((p) => p !== page);
    }),
    on: vi.fn(addListener),
    once: vi.fn(addListener),
    goto: vi.fn(async (url: string) => {
      page.currentUrl = url;
      return null;
    }),
    goBack: vi.fn(async () => null),
    title: vi.fn(async () => fake.title),
    url: vi.fn(() => page.currentUrl),
    setViewportSize: vi.fn(async () => {}),
    // Runs the function the tool built, in Node: the tests only pass harmless expressions.
    evaluate: vi.fn(async (fn: () => unknown) => fn()),
    screenshot: vi.fn(async () => Buffer.from('fake-page-image')),
    waitForEvent: vi.fn(async () => page.fileChooser),
    waitForTimeout: vi.fn(async () => {}),
    waitForURL: vi.fn(async () => {}),
    waitForLoadState: vi.fn(async () => {}),
    waitForSelector: vi.fn(async () => null),
    locator: vi.fn((selector: string) =>
      handleOf(fake.elements.get(selector.replace(/^aria-ref=/, ''))),
    ),
    $: vi.fn(async (selector: string) => fake.elements.get(selector) ?? null),
    getByText: vi.fn(() => handleOf(undefined)),
    getByRole: vi.fn(() => handleOf(undefined)),
    bringToFront: vi.fn(async () => {}),
    video: vi.fn(() => (fake.videoFile ? { path: vi.fn(async () => fake.videoFile) } : null)),
    context: vi.fn(() => context),
    _snapshotForAI: vi.fn(async () => fake.snapshot),
    keyboard: { press: vi.fn(async () => {}) },
    mouse: {
      move: vi.fn(async () => {}),
      down: vi.fn(async () => {}),
      up: vi.fn(async () => {}),
    },
  };
  fake.pages.push(page);
  return page;
}

function makeContext(options: Record<string, unknown>): FakeContext {
  const context: FakeContext = {
    options,
    openPages: [],
    newPage: vi.fn(async () => {
      const page = makePage(context);
      context.openPages.push(page);
      return page;
    }),
    pages: vi.fn(() => [...context.openPages]),
    close: vi.fn(async () => {
      for (const page of context.openPages) page.closed = true;
      context.openPages = [];
    }),
    newCDPSession: vi.fn(async () => {
      throw new Error('CDP is not available in the fake');
    }),
  };
  fake.contexts.push(context);
  return context;
}

function makeBrowser(): FakeBrowser {
  const browser: FakeBrowser = {
    connected: true,
    isConnected: vi.fn(() => browser.connected),
    newContext: vi.fn(async (options: Record<string, unknown> = {}) => makeContext(options)),
    close: vi.fn(async () => {
      browser.connected = false;
    }),
  };
  fake.browsers.push(browser);
  return browser;
}

/** The module `vi.mock('playwright', ...)` returns. */
export const playwrightModule = {
  chromium: {
    launch: vi.fn(async (options: Record<string, unknown> = {}) => {
      fake.launches.push(options);
      if (fake.launchError) throw fake.launchError;
      return makeBrowser();
    }),
  },
};

/** The page the app is using: the last one created that is still open. */
export function activePage(): FakePage {
  const page = [...fake.pages].reverse().find((p) => !p.closed);
  if (!page) throw new Error('the app has no open page');
  return page;
}
