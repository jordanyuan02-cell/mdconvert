/**
 * Diagnostic error logger for Tauri production debugging.
 *
 * Captures JS errors, unhandled rejections, and KaTeX render results,
 * making them accessible via `window.__DEBUG__` and a visible debug panel.
 */

interface DebugEntry {
  timestamp: string;
  type: 'error' | 'warn' | 'info' | 'katex';
  message: string;
  detail?: string;
}

const MAX_ENTRIES = 200;
const entries: DebugEntry[] = [];

function addEntry(type: DebugEntry['type'], message: string, detail?: string) {
  entries.push({ timestamp: new Date().toISOString().slice(11, 23), type, message, detail });
  if (entries.length > MAX_ENTRIES) entries.shift();
}

/** Install global error handlers. Call once at app startup. */
export function installDebugLogger() {
  if (typeof window === 'undefined') return;
  if ((window as any).__DEBUG_INSTALLED) return;
  (window as any).__DEBUG_INSTALLED = true;

  // Capture uncaught errors
  window.onerror = (msg, source, line, col, err) => {
    addEntry('error', `${msg}`, `${source}:${line}:${col}${err ? ' — ' + err.stack?.slice(0, 200) : ''}`);
  };

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    addEntry('error', `Unhandled Rejection: ${reason?.message || reason}`, reason?.stack?.slice(0, 200));
  });

  // Intercept console.error
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    addEntry('error', args.map(String).join(' '));
    origError.apply(console, args);
  };

  // Intercept console.warn
  const origWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    addEntry('warn', args.map(String).join(' '));
    origWarn.apply(console, args);
  };

  // Expose debug data for console inspection
  (window as any).__DEBUG__ = {
    entries,
    getErrors: () => entries.filter(e => e.type === 'error'),
    getAll: () => [...entries],
    clear: () => { entries.length = 0; },
  };

  addEntry('info', 'Debug logger installed. Access via window.__DEBUG__');
}

/** Log a KaTeX render result. */
export function logKatexRender(success: boolean, formula: string, error?: string) {
  addEntry(
    success ? 'info' : 'error',
    `KaTeX: ${success ? 'OK' : 'FAIL'}`,
    success ? formula.slice(0, 80) : `${formula.slice(0, 40)} → ${error}`
  );
}

/** Get all debug entries for display. */
export function getDebugEntries(): ReadonlyArray<DebugEntry> {
  return entries;
}

/** Render a debug overlay HTML string for injection into the preview. */
export function renderDebugOverlay(): string {
  const errorCount = entries.filter(e => e.type === 'error').length;
  const warnCount = entries.filter(e => e.type === 'warn').length;

  if (errorCount === 0 && warnCount === 0) return '';

  const recent = entries.slice(-10).reverse();

  return `
<div id="debug-overlay" style="
  position:fixed; bottom:0; right:0; z-index:99999;
  background:rgba(0,0,0,0.85); color:#fff;
  font-family:monospace; font-size:11px;
  max-width:500px; max-height:300px; overflow:auto;
  padding:8px 12px; border-radius:8px 0 0 0;
  pointer-events:auto;
">
  <div style="display:flex; gap:12px; margin-bottom:6px; font-weight:bold;">
    <span style="color:${errorCount > 0 ? '#ff4444' : '#4caf50'}">● Errors: ${errorCount}</span>
    <span style="color:${warnCount > 0 ? '#ffaa00' : '#4caf50'}">● Warnings: ${warnCount}</span>
  </div>
  ${recent.map(e => `
    <div style="color:${e.type === 'error' ? '#ff6b6b' : e.type === 'warn' ? '#ffd93d' : '#aaa'}; margin:2px 0;">
      [${e.timestamp}] ${e.message}
      ${e.detail ? `<span style="color:#888; font-size:10px;">${e.detail.slice(0, 120)}</span>` : ''}
    </div>
  `).join('')}
</div>`;
}
