/**
 * OAuth callback HTML pages.
 *
 * Minimal inline HTML for the browser-facing success and error pages
 * that the user sees after completing (or failing) an OAuth flow.
 */

const BASE_STYLE = `
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex; justify-content: center; align-items: center;
    min-height: 100vh; margin: 0;
    background: #f8f9fa; color: #1a1a1a;
  }
  .card {
    text-align: center; padding: 3rem 2rem;
    background: #fff; border-radius: 12px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    max-width: 420px; width: 90%;
  }
  .icon { font-size: 3rem; margin-bottom: 1rem; }
  h1 { font-size: 1.4rem; margin: 0 0 0.5rem; }
  p { color: #555; line-height: 1.5; margin: 0.5rem 0; }
  .subtle { font-size: 0.85rem; color: #999; margin-top: 1.5rem; }
`;

export function successPage(appName: string, alias?: string): string {
  const label = alias ? `${appName} (${alias})` : appName;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Connected</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${BASE_STYLE}</style></head>
<body><div class="card">
  <div class="icon">✅</div>
  <h1>${escapeHtml(label)} connected</h1>
  <p>Authentication complete. Your app is ready to use.</p>
  <p class="subtle">You can close this tab.</p>
</div></body></html>`;
}

export function errorPage(title: string, detail?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Error</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${BASE_STYLE} h1 { color: #c0392b; }</style></head>
<body><div class="card">
  <div class="icon">❌</div>
  <h1>${escapeHtml(title)}</h1>
  ${detail ? `<p>${escapeHtml(detail)}</p>` : ''}
  <p class="subtle">Close this tab and try again.</p>
</div></body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
