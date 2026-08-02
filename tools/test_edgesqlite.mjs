// Test harness for lib/edgesqlite.js — runnable with `node tools/test_edgesqlite.mjs`.
// Exercises the pure-JS SQLite reader against a synthetic Edge fixture
// (regenerate with `python tools/make_edge_fixture.py`). No test framework.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readSqlite, mapEdgeSqlite } from '../lib/edgesqlite.js';

const here = dirname(fileURLToPath(import.meta.url));
let failures = 0;

function assert(cond, msg) {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

const bytes = new Uint8Array(
  readFileSync(join(here, '..', 'fixtures', 'edge-collections-sample.sqlite'))
);

console.log('readSqlite (low-level):');
{
  const db = readSqlite(bytes);
  assert(db.pageSize === 4096, `reads page size (got ${db.pageSize})`);
  assert(!!db.tables.collections && !!db.tables.items, 'discovers tables from sqlite_master');
  const cols = db.tables.collections.columns;
  assert(cols[0] === 'id' && cols[3] === 'title' && cols[4] === 'position', 'parses column names in order');
  const items = db.getRows('items');
  assert(items.length === 5, `reads all item rows (got ${items.length})`);
}

console.log('\nmapEdgeSqlite (mapping + ordering):');
{
  const { collections, stats } = mapEdgeSqlite(bytes);
  assert(stats.collections === 2, `skips deleted collection, keeps 2 (got ${stats.collections})`);
  assert(stats.pages === 3, `imports 3 pages (got ${stats.pages})`);
  assert(stats.skipped === 2, `skips deleted item + item with no URL (got ${stats.skipped})`);

  // Collections come back sorted by Edge's `position` (Travel=5 before Recipes=10).
  assert(collections[0].title === 'Travel', `orders collections by position (got ${collections[0].title})`);
  assert(collections[1].title === 'Recipes', 'second collection is Recipes');

  const recipes = collections[1];
  // Intra-collection order follows relationship.position (i2=1 before i1=2).
  assert(recipes.pages[0].title === 'Second', `orders items by position (got ${recipes.pages[0].title})`);
  assert(recipes.pages[1].title === 'Big Image Page', 'second item is the big-image page');
  assert(recipes.pages[0].url === 'https://example.com/2', 'extracts URL from source JSON blob');
}

console.log('\noverflow-page reassembly:');
{
  const { collections } = mapEdgeSqlite(bytes);
  const big = collections[1].pages.find((p) => p.title === 'Big Image Page');
  const expectedLen = 'data:image/png;base64,'.length + 7000;
  assert(!!big, 'found the big-image page');
  assert(
    big.thumbnail.startsWith('data:image/png;base64,AAAA'),
    'reassembles the data-URI thumbnail across overflow pages'
  );
  assert(
    big.thumbnail.length === expectedLen,
    `reconstructs full ${expectedLen}-byte payload (got ${big.thumbnail.length})`
  );
  assert(big.favIconUrl === 'https://example.com/fav.ico', 'carries the favicon URL');
}

console.log('\nrejects non-SQLite input:');
{
  let threw = false;
  try {
    mapEdgeSqlite(new Uint8Array([1, 2, 3, 4]));
  } catch {
    threw = true;
  }
  assert(threw, 'throws on a non-SQLite file');
}

console.log('');
if (failures) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('All assertions passed.');
