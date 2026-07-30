// Tests for lib/pagemeta.js — runnable with `node tools/test_pagemeta.mjs`.
// No test framework; exits non-zero on the first failed assertion.
import { extractImageUrl } from '../lib/pagemeta.js';

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}
const eq = (a, b, msg) => assert(a === b, `${msg} (got: ${JSON.stringify(a)})`);

const PAGE = 'https://example.com/articles/hello';

console.log('extractImageUrl — Open Graph:');
{
  const html = `<html><head>
    <meta property="og:image" content="https://cdn.example.com/a.jpg">
  </head><body>...</body></html>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/a.jpg', 'reads og:image');
}
{
  // content= before the property attribute.
  const html = `<meta content="https://cdn.example.com/b.png" property="og:image" />`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/b.png', 'content= before property=');
}
{
  const html = `<meta property='og:image' content='https://cdn.example.com/c.jpg'>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/c.jpg', 'single-quoted attributes');
}

console.log('\nextractImageUrl — relative + protocol-relative:');
{
  const html = `<meta property="og:image" content="/img/hero.jpg">`;
  eq(extractImageUrl(html, PAGE), 'https://example.com/img/hero.jpg', 'resolves root-relative');
}
{
  const html = `<meta property="og:image" content="hero.jpg">`;
  eq(
    extractImageUrl(html, PAGE),
    'https://example.com/articles/hero.jpg',
    'resolves path-relative against the page'
  );
}
{
  const html = `<meta property="og:image" content="//cdn.example.com/p.jpg">`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/p.jpg', 'protocol-relative → https');
}

console.log('\nextractImageUrl — entities in the URL:');
{
  const html = `<meta property="og:image" content="https://cdn.example.com/i.jpg?a=1&amp;b=2">`;
  eq(
    extractImageUrl(html, PAGE),
    'https://cdn.example.com/i.jpg?a=1&b=2',
    'decodes &amp; in query string'
  );
}

console.log('\nextractImageUrl — fallback priority:');
{
  const html = `<head>
    <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
    <meta itemprop="image" content="https://cdn.example.com/ip.jpg">
  </head>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/tw.jpg', 'twitter:image before itemprop');
}
{
  const html = `<head><link rel="image_src" href="https://cdn.example.com/ls.jpg"></head>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/ls.jpg', 'link rel=image_src fallback');
}
{
  const html = `<head>
    <meta property="og:image" content="https://cdn.example.com/og.jpg">
    <meta name="twitter:image" content="https://cdn.example.com/tw.jpg">
  </head>`;
  eq(extractImageUrl(html, PAGE), 'https://cdn.example.com/og.jpg', 'og:image wins over twitter');
}

console.log('\nextractImageUrl — no image / bad input:');
{
  eq(extractImageUrl('<html><head><title>No image</title></head></html>', PAGE), '', 'no meta → ""');
  eq(extractImageUrl('', PAGE), '', 'empty string → ""');
  eq(extractImageUrl(null, PAGE), '', 'null → ""');
  const js = `<meta property="og:image" content="javascript:alert(1)">`;
  eq(extractImageUrl(js, PAGE), '', 'non-http(s) scheme rejected');
  const data = `<meta property="og:image" content="data:image/png;base64,AAAA">`;
  eq(extractImageUrl(data, PAGE), '', 'data: URL rejected (not http(s))');
}

console.log('\nextractImageUrl — only scans the head:');
{
  const html = `<head><title>x</title></head><body>
    <meta property="og:image" content="https://cdn.example.com/body.jpg"></body>`;
  eq(extractImageUrl(html, PAGE), '', 'ignores og:image that appears after </head>');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All pagemeta.js tests passed.');
