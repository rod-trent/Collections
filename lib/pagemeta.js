// pagemeta.js — extract a representative preview image URL from a page's raw
// HTML. Pure logic (no `chrome`, no DOM), so it's unit-testable and can run in
// the service worker, which has no DOMParser. Mirrors the priority order used by
// the in-page scraper in background.js (og:image → twitter:image → itemprop
// image → <link rel="image_src">), but works from fetched HTML text rather than
// a live tab — which is what lets us backfill images for imported pages that
// were never opened.

// Match a <meta> tag and pull its content= value, regardless of attribute order
// (content= may come before or after the identifying property/name attribute).
// `[^>]*` stays within the single tag; quotes may be single or double.
function metaContent(html, attr, value) {
  const val = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // escape for regex
  const idRe = `${attr}\\s*=\\s*["']${val}["']`;
  const contentRe = `content\\s*=\\s*["']([^"']*)["']`;
  // content= either after the identifying attr…
  const after = new RegExp(`<meta\\b[^>]*${idRe}[^>]*${contentRe}`, 'i');
  // …or before it.
  const before = new RegExp(`<meta\\b[^>]*${contentRe}[^>]*${idRe}`, 'i');
  const m = html.match(after) || html.match(before);
  return m ? decodeEntities(m[1].trim()) : '';
}

// <link rel="image_src" href="…"> — an older but still-seen convention.
function linkImageSrc(html) {
  const href = `href\\s*=\\s*["']([^"']*)["']`;
  const rel = `rel\\s*=\\s*["']image_src["']`;
  const after = new RegExp(`<link\\b[^>]*${rel}[^>]*${href}`, 'i');
  const before = new RegExp(`<link\\b[^>]*${href}[^>]*${rel}`, 'i');
  const m = html.match(after) || html.match(before);
  return m ? decodeEntities(m[1].trim()) : '';
}

// Meta values are HTML-escaped (e.g. &amp; in query strings). Decode the small
// set that actually appears in URLs; leave everything else untouched.
function decodeEntities(s) {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .replace(/&#x26;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

/**
 * Extract a preview image URL from page HTML, resolved to an absolute URL
 * against the page's own URL. Returns '' when no candidate is found or the
 * candidate can't be resolved to an http(s) URL.
 *
 * Only the document <head> matters for these tags, so we scan a bounded prefix
 * of the HTML — this keeps giant pages cheap and avoids matching image meta
 * that some sites emit inside article bodies.
 *
 * @param {string} html   raw HTML text
 * @param {string} pageUrl the URL the HTML was fetched from (for resolving relatives)
 * @returns {string} absolute http(s) image URL, or ''
 */
export function extractImageUrl(html, pageUrl) {
  if (!html || typeof html !== 'string') return '';
  // The head is all we need; cap the scan so a multi-MB body stays cheap.
  const headEnd = html.search(/<\/head>/i);
  const scan = html.slice(0, headEnd >= 0 ? headEnd : Math.min(html.length, 200_000));

  const raw =
    metaContent(scan, 'property', 'og:image') ||
    metaContent(scan, 'property', 'og:image:url') ||
    metaContent(scan, 'name', 'og:image') || // some sites use name= for OG
    metaContent(scan, 'name', 'twitter:image') ||
    metaContent(scan, 'name', 'twitter:image:src') ||
    metaContent(scan, 'property', 'twitter:image') ||
    metaContent(scan, 'itemprop', 'image') ||
    linkImageSrc(scan);

  if (!raw) return '';
  return resolveUrl(raw, pageUrl);
}

/** Resolve a possibly-relative image URL against the page; keep only http(s). */
function resolveUrl(src, pageUrl) {
  let out = src;
  try {
    out = new URL(src, pageUrl).href;
  } catch {
    // No base (or malformed) — accept only if it's already absolute http(s).
    if (!/^https?:\/\//i.test(src)) return '';
  }
  // Protocol-relative (//host/img.jpg) resolves via the base above; guard the
  // no-base path too.
  if (/^\/\//.test(out)) out = `https:${out}`;
  return /^https?:\/\//i.test(out) ? out : '';
}
