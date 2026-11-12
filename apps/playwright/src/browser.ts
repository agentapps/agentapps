/**
 * Shared browser state and helpers for the Playwright Agent App.
 *
 * All module-level state lives here. Tool files import getters/setters
 * because only the declaring module can reassign `let` bindings in ES modules.
 */

import {
  type Browser,
  type BrowserContext,
  chromium,
  type ElementHandle,
  type Page,
} from 'playwright';

// =============================================================================
// BROWSER STATE
// =============================================================================

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

// Recording state
let isRecording = false;
let videoPath: string | null = null;

// Console messages storage
export const consoleMessages: Array<{ level: string; text: string; timestamp: number }> = [];

// Timestamps for filtering console messages
let lastNavigationTime: number = 0;
let lastActionTime: number = 0;

// Network requests storage
export const networkRequests: Array<{
  url: string;
  method: string;
  status?: number;
  resourceType: string;
  timestamp: Date;
}> = [];

// =============================================================================
// GETTERS / SETTERS
// =============================================================================

export function getBrowser(): Browser | null {
  return browser;
}

export function getContext(): BrowserContext | null {
  return context;
}

export function getPage(): Page | null {
  return page;
}

export function setPage(p: Page | null): void {
  page = p;
}

export function setContext(c: BrowserContext | null): void {
  context = c;
}

export function getIsRecording(): boolean {
  return isRecording;
}

export function setIsRecording(v: boolean): void {
  isRecording = v;
}

export function getVideoPath(): string | null {
  return videoPath;
}

export function setVideoPath(v: string | null): void {
  videoPath = v;
}

export function getLastNavigationTime(): number {
  return lastNavigationTime;
}

export function getLastActionTime(): number {
  return lastActionTime;
}

export function resetLastNavigationTime(): void {
  lastNavigationTime = Date.now();
}

export function resetLastActionTime(): void {
  lastActionTime = Date.now();
}

// =============================================================================
// DEVICE PRESETS
// =============================================================================

export const DEVICE_PRESETS: Record<
  string,
  {
    viewport: { width: number; height: number };
    userAgent: string;
    isMobile: boolean;
    hasTouch: boolean;
  }
> = {
  'iphone-13': {
    viewport: { width: 390, height: 844 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  'iphone-15-pro': {
    viewport: { width: 393, height: 852 },
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  'ipad-pro-11': {
    viewport: { width: 834, height: 1194 },
    userAgent:
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  'pixel-7': {
    viewport: { width: 412, height: 915 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  },
  'galaxy-s23': {
    viewport: { width: 360, height: 780 },
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  },
  'desktop-1080p': {
    viewport: { width: 1920, height: 1080 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    isMobile: false,
    hasTouch: false,
  },
  'desktop-720p': {
    viewport: { width: 1280, height: 720 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    isMobile: false,
    hasTouch: false,
  },
};

// =============================================================================
// BROWSER OPTIONS
// =============================================================================

export interface BrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  recordVideo?: { dir: string; size?: { width: number; height: number } };
  device?: string;
  userAgent?: string;
  isMobile?: boolean;
  hasTouch?: boolean;
}

// =============================================================================
// BROWSER MANAGEMENT
// =============================================================================

export async function ensureBrowser(
  opts?: BrowserOptions,
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const headless = opts?.headless ?? true;

  if (!browser?.isConnected()) {
    browser = await chromium.launch({
      headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  // Recreate context if options require it (recording, device emulation, or explicit viewport)
  const needsNewContext =
    opts &&
    (opts.recordVideo ||
      opts.device ||
      opts.viewport ||
      opts.userAgent ||
      opts.isMobile !== undefined);

  if (!context || needsNewContext) {
    // If we have an existing context with recording, save the video before replacing
    if (context && isRecording) {
      try {
        await context.close();
      } catch {}
      isRecording = false;
    }

    const contextOptions: any = {
      viewport: opts?.viewport ?? { width: 1280, height: 720 },
    };

    if (opts?.recordVideo) {
      contextOptions.recordVideo = opts.recordVideo;
    }
    if (opts?.userAgent) {
      contextOptions.userAgent = opts.userAgent;
    }
    if (opts?.isMobile !== undefined) {
      contextOptions.isMobile = opts.isMobile;
    }
    if (opts?.hasTouch !== undefined) {
      contextOptions.hasTouch = opts.hasTouch;
    }

    context = await browser.newContext(contextOptions);

    if (opts?.recordVideo) {
      isRecording = true;
    }
  }

  if (!page || page.isClosed()) {
    page = await context.newPage();

    // Set up console message collection
    page.on('console', (msg) => {
      consoleMessages.push({
        level: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
      // Keep only last 1000 messages
      if (consoleMessages.length > 1000) {
        consoleMessages.shift();
      }
    });

    // Set up network request collection
    page.on('request', (request) => {
      networkRequests.push({
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        timestamp: new Date(),
      });
    });

    page.on('response', (response) => {
      const req = networkRequests.find((r) => r.url === response.url() && !r.status);
      if (req) {
        req.status = response.status();
      }
    });
  }

  return { browser, context, page };
}

export async function closeBrowser(): Promise<void> {
  if (page && !page.isClosed()) {
    await page.close();
    page = null;
  }
  if (context) {
    // Closing the context finalizes and saves any active video recording
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
  isRecording = false;
  videoPath = null;
  consoleMessages.length = 0;
  networkRequests.length = 0;
}

// =============================================================================
// SNAPSHOT HELPERS
// =============================================================================

export async function getAccessibilitySnapshot(p: Page): Promise<string> {
  // Use Playwright's internal _snapshotForAI method (available since ~1.49)
  // This generates ARIA snapshots with refs that can be used with aria-ref= locators
  try {
    const snapshot = await (p as any)._snapshotForAI();

    if (!snapshot?.full) {
      return 'Page has no accessibility tree';
    }

    return `# Page Accessibility Snapshot

URL: ${p.url()}
Title: ${await p.title()}

## Accessibility Tree

${snapshot.full}

---
Use the ref values (e.g., [ref=s1e3]) with browser-click, browser-type, etc. to interact with elements.`;
  } catch (_error) {
    // Fallback to CDP if _snapshotForAI is not available
    return await getAccessibilitySnapshotViaCDP(p);
  }
}

export async function getAccessibilitySnapshotViaCDP(p: Page): Promise<string> {
  // Fallback: Use CDP to get accessibility tree
  const client = await p.context().newCDPSession(p);

  try {
    const { nodes } = await client.send('Accessibility.getFullAXTree');

    if (!nodes || nodes.length === 0) {
      return 'Page has no accessibility tree';
    }

    const nodeMap = new Map<string, any>();
    for (const node of nodes) {
      nodeMap.set(node.nodeId, node);
    }

    const rootNode = nodes.find((n: any) => !n.parentId);

    function formatNode(node: any, indent: number = 0): string {
      if (!node) return '';

      const prefix = '  '.repeat(indent);
      const role = node.role?.value || 'unknown';
      const name = node.name?.value || '';
      const value = node.value?.value;
      const checked = node.checked?.value;
      const selected = node.selected?.value;
      const expanded = node.expanded?.value;

      if (node.ignored || (role === 'generic' && !name)) {
        let result = '';
        if (node.childIds) {
          for (const childId of node.childIds) {
            const child = nodeMap.get(childId);
            if (child) result += formatNode(child, indent);
          }
        }
        return result;
      }

      let result = `${prefix}- ${role}`;
      if (name) result += `: "${name}"`;
      if (value !== undefined) result += ` [value: "${value}"]`;
      if (checked !== undefined) result += ` [checked: ${checked}]`;
      if (selected !== undefined) result += ` [selected: ${selected}]`;
      if (expanded !== undefined) result += ` [expanded: ${expanded}]`;
      result += '\n';

      if (node.childIds) {
        for (const childId of node.childIds) {
          const child = nodeMap.get(childId);
          if (child) result += formatNode(child, indent + 1);
        }
      }

      return result;
    }

    const tree = formatNode(rootNode);
    return `# Page Accessibility Snapshot

URL: ${p.url()}
Title: ${await p.title()}

## Accessibility Tree

${tree}`;
  } finally {
    await client.detach();
  }
}

// =============================================================================
// ELEMENT HELPERS
// =============================================================================

export async function findElementByRef(
  p: Page,
  ref: string,
  retries = 2,
): Promise<ElementHandle | null> {
  // ref format from _snapshotForAI is like "e3", "e78", "s1e3", etc.
  // These work with the internal aria-ref locator

  for (let attempt = 0; attempt <= retries; attempt++) {
    // Try as aria-ref first (most common case from snapshots)
    // Refs can be "e3", "e78", "s1e3", etc.
    if (/^(s\d+)?e\d+$/.test(ref)) {
      try {
        const locator = p.locator(`aria-ref=${ref}`);
        // Wait briefly for element to be available
        await locator.waitFor({ state: 'attached', timeout: 3000 });
        const element = await locator.first().elementHandle({ timeout: 2000 });
        if (element) return element;
      } catch (_e) {
        // If this is not the last attempt, wait a bit and retry
        if (attempt < retries) {
          await p.waitForTimeout(500);
          continue;
        }
      }
    }

    // Try as a CSS selector
    try {
      const element = await p.$(ref);
      if (element) return element;
    } catch {}

    // Try as text content
    try {
      const element = await p
        .getByText(ref, { exact: false })
        .first()
        .elementHandle({ timeout: 2000 });
      if (element) return element;
    } catch {}

    // Try as role + name (e.g., 'button "Submit"')
    try {
      const match = ref.match(/(\w+)\s*"([^"]+)"/);
      if (match) {
        const [, role, name] = match;
        const element = await p
          .getByRole(role as any, { name })
          .first()
          .elementHandle({ timeout: 2000 });
        if (element) return element;
      }
    } catch {}

    // Wait before retry
    if (attempt < retries) {
      await p.waitForTimeout(500);
    }
  }

  return null;
}

/**
 * Attach console and network listeners to a page.
 * Used when creating a new page outside ensureBrowser (recording, device emulation).
 */
export function attachPageListeners(p: Page): void {
  p.on('console', (msg) => {
    consoleMessages.push({
      level: msg.type(),
      text: msg.text(),
      timestamp: Date.now(),
    });
    if (consoleMessages.length > 1000) {
      consoleMessages.shift();
    }
  });

  p.on('request', (request) => {
    networkRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      timestamp: new Date(),
    });
  });

  p.on('response', (response) => {
    const req = networkRequests.find((r) => r.url === response.url() && !r.status);
    if (req) {
      req.status = response.status();
    }
  });
}
