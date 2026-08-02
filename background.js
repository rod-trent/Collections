// background.js — service worker.
// - Opens the side panel when the toolbar icon is clicked.
// - Maintains right-click context menus (with a per-collection submenu) for
//   saving pages, links, images and selected text into a collection.

import {
  getData,
  addItem,
  createCollection,
  ensureActiveCollection,
  findPageByUrl,
  getSettings,
  cacheItemImage,
  applyLinkResults,
  applyImageResults,
  STORAGE_KEY,
} from './lib/store.js';
import { srcToCover } from './lib/image.js';
import { classifyStatus } from './lib/linkcheck.js';
import { extractImageUrl } from './lib/pagemeta.js';
import { matchRule } from './lib/rules.js';
import { searchEntries } from './lib/omnibox.js';

// If offline image caching is on, inline the freshly-saved item's image.
async function maybeCache(out) {
  if (!out?.item || !out?.collection) return;
  try {
    if ((await getSettings()).cacheImages) await cacheItemImage(out.collection.id, out.item.id);
  } catch {
    /* best effort */
  }
}

// Open the side panel on action click (Edge + Chrome).
chrome.sidePanel
  ?.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.warn('setPanelBehavior failed', err));

// ---- Context menus ---------------------------------------------------------

// Parent menu items keyed by the context they apply to.
const PARENTS = [
  { id: 'save-page', title: 'Save page to Collections Plus', contexts: ['page'] },
  { id: 'save-link', title: 'Save link to Collections Plus', contexts: ['link'] },
  { id: 'save-image', title: 'Save image to Collections Plus', contexts: ['image'] },
  { id: 'save-note', title: 'Save selection as note', contexts: ['selection'] },
  { id: 'save-highlight', title: 'Save selection as highlight', contexts: ['selection'] },
];

const NEW_SUFFIX = '::new'; // child id suffix for "New collection…"

async function rebuildMenus() {
  await chrome.contextMenus.removeAll();
  const { collections } = await getData();

  for (const parent of PARENTS) {
    chrome.contextMenus.create({
      id: parent.id,
      title: parent.title,
      contexts: parent.contexts,
    });

    // One child per existing collection.
    for (const c of collections) {
      chrome.contextMenus.create({
        id: `${parent.id}::${c.id}`,
        parentId: parent.id,
        title: c.title || 'Untitled',
        contexts: parent.contexts,
      });
    }

    if (collections.length > 0) {
      chrome.contextMenus.create({
        id: `${parent.id}::sep`,
        parentId: parent.id,
        type: 'separator',
        contexts: parent.contexts,
      });
    }

    // Always offer a "new collection" target.
    chrome.contextMenus.create({
      id: `${parent.id}${NEW_SUFFIX}`,
      parentId: parent.id,
      title: '＋ New collection…',
      contexts: parent.contexts,
    });
  }
}

chrome.runtime.onInstalled.addListener(rebuildMenus);
chrome.runtime.onStartup.addListener(rebuildMenus);

// Keep menus in sync whenever the data changes (e.g. from the panel).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEY]) rebuildMenus();
});

// ---- Metadata capture ------------------------------------------------------

// Runs in the page to extract a representative thumbnail + title.
function scrapeMeta() {
  const pick = (sel, attr) => document.querySelector(sel)?.getAttribute(attr) || '';
  let thumbnail =
    pick('meta[property="og:image"]', 'content') ||
    pick('meta[name="twitter:image"]', 'content') ||
    pick('meta[itemprop="image"]', 'content');
  // Resolve relative URLs against the page.
  if (thumbnail) {
    try {
      thumbnail = new URL(thumbnail, location.href).href;
    } catch {
      /* leave as-is */
    }
  }
  return { thumbnail, title: document.title || location.href };
}

async function captureMeta(tabId) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId },
      func: scrapeMeta,
    });
    return res?.result || {};
  } catch {
    // Restricted pages (edge://, store pages, etc.) can't be scripted.
    return {};
  }
}

// Fallback thumbnail: a downscaled screenshot of the active (visible) tab.
async function captureScreenshotThumb(windowId) {
  try {
    const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 60 });
    return shot ? await srcToCover(shot, 512) : '';
  } catch {
    return '';
  }
}

// ---- Keyboard command: save the current page -------------------------------

chrome.commands?.onCommand.addListener(async (command) => {
  if (command !== 'save-current-page') return;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab || !/^https?:/i.test(tab.url || '')) return;

  const meta = tab.id != null ? await captureMeta(tab.id) : {};
  const title = meta.title || tab.title || tab.url;

  // Auto-file rules can route the quick-save into a specific collection by
  // domain/URL/title; otherwise fall back to the active collection.
  const data = await getData();
  const ruled = matchRule(data.rules, { url: tab.url, title });
  const col =
    (ruled && data.collections.find((c) => c.id === ruled)) || (await ensureActiveCollection());
  if (await findPageByUrl(col.id, tab.url)) return; // already saved — skip

  let thumbnail = meta.thumbnail || '';
  if (!thumbnail) thumbnail = await captureScreenshotThumb(tab.windowId);

  const out = await addItem(col.id, {
    type: 'page',
    url: tab.url,
    title,
    favIconUrl: tab.favIconUrl || '',
    thumbnail,
    unread: (await getSettings()).readingListEnabled,
  });
  await maybeCache(out);
});

// ---- Click handling --------------------------------------------------------

function parseMenuId(menuItemId) {
  const id = String(menuItemId);
  for (const parent of PARENTS) {
    if (id === `${parent.id}${NEW_SUFFIX}`) {
      return { action: parent.id, target: 'new' };
    }
    if (id.startsWith(`${parent.id}::`)) {
      const target = id.slice(`${parent.id}::`.length);
      if (target === 'sep') return null;
      return { action: parent.id, target };
    }
  }
  return null;
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const parsed = parseMenuId(info.menuItemId);
  if (!parsed) return;

  // Resolve the destination collection id (creating one if "new").
  let collectionId = parsed.target;
  if (parsed.target === 'new') {
    const created = await createCollection('New collection');
    collectionId = created.id;
  }

  if (parsed.action === 'save-image') {
    const out = await addItem(collectionId, {
      type: 'image',
      src: info.srcUrl,
      srcPageUrl: info.pageUrl || tab?.url || '',
      alt: '',
    });
    await maybeCache(out);
    return;
  }

  if (parsed.action === 'save-link') {
    await addItem(collectionId, {
      type: 'page',
      url: info.linkUrl,
      title: info.linkText || info.selectionText || info.linkUrl,
      favIconUrl: tab?.favIconUrl || '',
      unread: (await getSettings()).readingListEnabled,
    });
    return;
  }

  if (parsed.action === 'save-note') {
    await addItem(collectionId, {
      type: 'note',
      text: info.selectionText || '',
    });
    return;
  }

  if (parsed.action === 'save-highlight') {
    // A highlight keeps the quote anchored to its source page + title.
    const meta = tab?.id != null ? await captureMeta(tab.id) : {};
    await addItem(collectionId, {
      type: 'highlight',
      text: info.selectionText || '',
      url: info.pageUrl || tab?.url || '',
      title: meta.title || tab?.title || tab?.url || info.pageUrl || '',
    });
    return;
  }

  // save-page (default)
  const meta = tab?.id != null ? await captureMeta(tab.id) : {};
  const out = await addItem(collectionId, {
    type: 'page',
    url: tab?.url || info.pageUrl,
    title: meta.title || tab?.title || tab?.url || info.pageUrl,
    favIconUrl: tab?.favIconUrl || '',
    thumbnail: meta.thumbnail || '',
    unread: (await getSettings()).readingListEnabled,
  });
  await maybeCache(out);
});

// ---- Link-rot checking -----------------------------------------------------
// Probe saved page URLs to catch link rot. The verdict logic lives in
// lib/linkcheck.js (pure, tested); here we just do the network I/O. Our
// <all_urls> host permission lets the worker fetch cross-origin without CORS.

const LINK_TIMEOUT_MS = 8000;
const LINK_CONCURRENCY = 5;

// Probe one URL → 'ok' | 'dead' | 'unknown'.
async function probeUrl(url) {
  if (!/^https?:/i.test(url || '')) return 'unknown';
  const attempt = async (method) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), LINK_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        signal: ctrl.signal,
        cache: 'no-store',
      });
      return { status: res.status };
    } catch (e) {
      return e?.name === 'AbortError' ? { timedOut: true } : { networkError: true };
    } finally {
      clearTimeout(timer);
    }
  };
  let outcome = await attempt('HEAD');
  // Some servers reject or mishandle HEAD (405) — confirm with a GET before
  // trusting a network error or a method-not-allowed.
  if (outcome.status === 405 || outcome.networkError) {
    const get = await attempt('GET');
    if (!get.networkError) outcome = get;
  }
  return classifyStatus(outcome);
}

// Collect probe targets (http(s) page items), optionally scoped to one
// collection or to entries not checked since `staleBefore`.
function collectTargets(data, { collectionId, staleBefore } = {}) {
  const cols = collectionId
    ? data.collections.filter((c) => c.id === collectionId)
    : data.collections;
  const targets = [];
  for (const c of cols) {
    for (const it of c.items) {
      if (it.type !== 'page' || !/^https?:/i.test(it.url || '')) continue;
      if (staleBefore != null && it.linkCheckedAt && it.linkCheckedAt >= staleBefore) continue;
      targets.push({ collectionId: c.id, itemId: it.id, url: it.url, at: it.linkCheckedAt || 0 });
    }
  }
  return targets;
}

// Probe a list of targets with bounded concurrency; persist in one batch.
async function probeTargets(targets) {
  const results = new Array(targets.length);
  let idx = 0;
  let dead = 0;
  const worker = async () => {
    for (let i = idx++; i < targets.length; i = idx++) {
      const t = targets[i];
      const status = await probeUrl(t.url);
      if (status === 'dead') dead++;
      results[i] = {
        collectionId: t.collectionId,
        itemId: t.itemId,
        // Only record a definite verdict; 'unknown' just stamps the time.
        linkStatus: status === 'ok' || status === 'dead' ? status : undefined,
        linkCheckedAt: Date.now(),
      };
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(LINK_CONCURRENCY, targets.length) }, worker)
  );
  await applyLinkResults(results.filter(Boolean));
  return { checked: targets.length, dead };
}

// On-demand check (from the panel): all collections or just one.
async function checkLinks(collectionId) {
  const data = await getData();
  return probeTargets(collectTargets(data, { collectionId }));
}

// ---- Image backfill (fetch missing preview images) -------------------------
// Imported pages (e.g. from a CSV) have no thumbnail, and we can't scrape a
// live tab for a URL that isn't open. Instead we fetch the page HTML directly
// (host access covers this), pull an og:image/twitter:image URL out of it, then
// downscale that image into a stored data URL — the same size/format the normal
// save path produces. Pages with no such image are left untouched (they keep
// their favicon fallback).

const IMAGE_FETCH_TIMEOUT_MS = 10000;
const IMAGE_FETCH_CONCURRENCY = 4;
const MAX_HTML_BYTES = 1_500_000; // the <head> comes early; don't buffer more

// Read a response body as text but stop early — once we've seen the whole
// <head> (all our meta tags live there) or hit the byte cap. Keeps a multi-MB
// page from being fully buffered just to read a few meta tags.
async function readHtmlHead(res, maxBytes) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, maxBytes);
  const decoder = new TextDecoder();
  let out = '';
  let seen = 0;
  try {
    while (seen < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      seen += value.byteLength;
      out += decoder.decode(value, { stream: true });
      if (/<\/head>/i.test(out)) break;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* stream already closed */
    }
  }
  return out;
}

// Fetch a page's HTML (bounded) and return an absolute preview-image URL, or ''.
async function fetchPageImageUrl(pageUrl) {
  if (!/^https?:/i.test(pageUrl || '')) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), IMAGE_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(pageUrl, {
      redirect: 'follow',
      signal: ctrl.signal,
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) return '';
    const type = res.headers.get('content-type') || '';
    if (type && !/text\/html|application\/xhtml\+xml/i.test(type)) return '';
    const html = await readHtmlHead(res, MAX_HTML_BYTES);
    return extractImageUrl(html, res.url || pageUrl);
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

// One page: fetch its image URL, then downscale to a stored data URL. '' on miss.
async function fetchPageThumbnail(pageUrl) {
  const imgUrl = await fetchPageImageUrl(pageUrl);
  if (!imgUrl) return '';
  try {
    return await srcToCover(imgUrl, 512);
  } catch {
    return ''; // image URL was found but couldn't be fetched/decoded
  }
}

// Collect page items that need an image, optionally scoped to one collection or
// a single item. `replace` includes items that already have a thumbnail.
function collectImageTargets(data, { collectionId, itemId, replace } = {}) {
  const cols = collectionId
    ? data.collections.filter((c) => c.id === collectionId)
    : data.collections;
  const targets = [];
  for (const c of cols) {
    for (const it of c.items) {
      if (itemId && it.id !== itemId) continue;
      if (it.type !== 'page' || !/^https?:/i.test(it.url || '')) continue;
      if (!replace && it.thumbnail) continue; // only fill blanks unless replacing
      targets.push({ collectionId: c.id, itemId: it.id, url: it.url });
    }
  }
  return targets;
}

// Fetch thumbnails for a list of targets with bounded concurrency; persist in a
// single batch write. Returns how many targets were scanned and how many got an
// image.
async function fetchImageTargets(targets) {
  const results = new Array(targets.length);
  let idx = 0;
  let found = 0;
  const worker = async () => {
    for (let i = idx++; i < targets.length; i = idx++) {
      const thumbnail = await fetchPageThumbnail(targets[i].url);
      if (thumbnail) {
        found++;
        results[i] = {
          collectionId: targets[i].collectionId,
          itemId: targets[i].itemId,
          thumbnail,
        };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(IMAGE_FETCH_CONCURRENCY, targets.length) }, worker)
  );
  await applyImageResults(results.filter(Boolean));
  return { total: targets.length, found };
}

// On-demand from the panel: all collections, one collection, or a single item.
// A single-item request is an explicit "refresh this one", so it always
// replaces; bulk requests honour the replaceExistingImages setting.
async function fetchImages({ collectionId, itemId } = {}) {
  const replace = itemId ? true : (await getSettings()).replaceExistingImages;
  const data = await getData();
  const targets = collectImageTargets(data, { collectionId, itemId, replace });
  return fetchImageTargets(targets);
}

// ---- Periodic auto-check (opt-in) ------------------------------------------

const LINK_ALARM = 'linkcheck';
const RECHECK_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // re-probe at most weekly
const MAX_PER_RUN = 40; // keep each wake-up cheap

function ensureLinkAlarm() {
  chrome.alarms?.get(LINK_ALARM, (a) => {
    if (!a) chrome.alarms.create(LINK_ALARM, { periodInMinutes: 6 * 60 });
  });
}
chrome.runtime.onInstalled.addListener(ensureLinkAlarm);
chrome.runtime.onStartup.addListener(ensureLinkAlarm);

chrome.alarms?.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== LINK_ALARM) return;
  if (!(await getSettings()).autoCheckLinks) return;
  const data = await getData();
  const stale = collectTargets(data, { staleBefore: Date.now() - RECHECK_AFTER_MS });
  stale.sort((a, b) => a.at - b.at); // oldest (or never-checked) first
  if (stale.length) await probeTargets(stale.slice(0, MAX_PER_RUN));
});

// ---- Omnibox: address-bar search ("col <query>") ---------------------------

function escapeXml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c])
  );
}

chrome.omnibox?.setDefaultSuggestion({
  description: 'Search your collections — type to find a saved page',
});

chrome.omnibox?.onInputChanged.addListener(async (text, suggest) => {
  const data = await getData();
  suggest(
    searchEntries(data.collections, text).map((e) => ({
      content: e.url,
      description: `${escapeXml(e.title)} <dim>— ${escapeXml(e.collection)}</dim>`,
    }))
  );
});

chrome.omnibox?.onInputEntered.addListener(async (text, disposition) => {
  let url = text;
  if (!/^https?:\/\//i.test(url)) {
    // The user hit Enter on free text rather than picking a suggestion — open
    // the best match.
    const data = await getData();
    const [first] = searchEntries(data.collections, text, { max: 1 });
    if (!first) return;
    url = first.url;
  }
  if (disposition === 'currentTab') chrome.tabs.update({ url });
  else chrome.tabs.create({ url, active: disposition === 'newForegroundTab' });
});

// ---- Messages from the side panel -----------------------------------------
// The panel asks the worker to capture metadata for the active tab when the
// user clicks "Add current page" (scripting must run from the worker), and to
// run link checks (network I/O belongs in the worker).
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'captureMeta' && typeof msg.tabId === 'number') {
    captureMeta(msg.tabId).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'checkLinks') {
    checkLinks(msg.collectionId).then(sendResponse).catch(() => sendResponse(null));
    return true; // async response
  }
  if (msg?.type === 'fetchImages') {
    fetchImages({ collectionId: msg.collectionId, itemId: msg.itemId })
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true; // async response
  }
  return false;
});
