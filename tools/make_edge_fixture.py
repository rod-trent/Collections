#!/usr/bin/env python3
"""Generate a small synthetic Edge `collectionsSQLite` fixture for tests.

Mirrors the real Edge Collections schema (table names + column order) so the
pure-JS reader in lib/edgesqlite.js can be exercised against a realistic file
without shipping anyone's personal data. Includes:

  * collections in non-sequential `position` order (to test ordering),
  * a collection + item marked for deletion (to test filtering),
  * an item whose `source` blob is missing a URL (to test skipping),
  * an item with a >4 KB base64 `canonical_image_url` so the record spills onto
    SQLite overflow pages (to test overflow-page reassembly).

Run:  python tools/make_edge_fixture.py
Writes: fixtures/edge-collections-sample.sqlite
"""

import json
import os
import sqlite3

OUT = os.path.join(os.path.dirname(__file__), "..", "fixtures", "edge-collections-sample.sqlite")


def source_blob(url, website):
    return json.dumps({"url": url, "websiteName": website}).encode("utf-8")


def main():
    out = os.path.abspath(OUT)
    if os.path.exists(out):
        os.remove(out)
    con = sqlite3.connect(out)
    cur = con.cursor()
    # Exact CREATE TABLE statements observed in a real Edge collectionsSQLite.
    cur.executescript(
        """
        CREATE TABLE collections ( id LONGVARCHAR PRIMARY KEY, date_created REAL NOT NULL, date_modified REAL NOT NULL, title LONGVARCHAR NOT NULL, position INTEGER NOT NULL, is_syncable INTEGER DEFAULT 1, suggestion_url LONGVARCHAR, suggestion_dismissed INTEGER, suggestion_type INTEGER, thumbnail BLOB, is_custom_thumbnail INTEGER NOT NULL DEFAULT 0, tag LONGVARCHAR, thumbnail_url LONGVARCHAR, is_marked_for_deletion INTEGER);
        CREATE TABLE items ( id LONGVARCHAR PRIMARY KEY, date_created REAL NOT NULL, date_modified REAL NOT NULL, title LONGVARCHAR, source BLOB, entity_blob BLOB, favicon_url LONGVARCHAR, canonical_image_data BLOB, canonical_image_url LONGVARCHAR, text_content LONGVARCHAR, html_content LONGVARCHAR, type LONGVARCHAR, progressing INTEGER, is_syncable INTEGER DEFAULT 1, color LONGVARCHAR, third_party_data BLOB, remote_url LONGVARCHAR, tag LONGVARCHAR, is_marked_for_deletion INTEGER);
        CREATE TABLE collections_items_relationship ( item_id LONGVARCHAR NOT NULL, parent_id LONGVARCHAR NOT NULL, position INTEGER NOT NULL);
        CREATE TABLE meta(key LONGVARCHAR NOT NULL UNIQUE PRIMARY KEY, value LONGVARCHAR);
        """
    )

    # Collections (deliberately out of position order; C is deleted).
    collections = [
        ("col-a", "Recipes", 10, 0),
        ("col-b", "Travel", 5, 0),
        ("col-c", "Deleted", 1, 1),
    ]
    for cid, title, pos, deleted in collections:
        cur.execute(
            "INSERT INTO collections (id,date_created,date_modified,title,position,is_marked_for_deletion) VALUES (?,?,?,?,?,?)",
            (cid, 0.0, 0.0, title, pos, deleted),
        )

    big_image = "data:image/png;base64," + ("A" * 7000)  # forces record overflow
    items = [
        # id, title, url, website, canonical_image_url, favicon, deleted
        ("i1", "Big Image Page", "https://example.com/big", "example.com", big_image, "https://example.com/fav.ico", 0),
        ("i2", "Second", "https://example.com/2", "example.com", "https://cdn.example.com/2.png", "", 0),
        ("i3", "Travel One", "https://travel.com/1", "travel.com", "", "", 0),
        ("i4", "Deleted Item", "https://example.com/dead", "example.com", "", "", 1),
        ("i5", "No URL Item", None, None, "", "", 0),  # missing source url -> skipped
    ]
    for iid, title, url, website, img, fav, deleted in items:
        src = source_blob(url, website) if url else json.dumps({}).encode("utf-8")
        cur.execute(
            "INSERT INTO items (id,date_created,date_modified,title,source,favicon_url,canonical_image_url,type,is_marked_for_deletion) VALUES (?,?,?,?,?,?,?,?,?)",
            (iid, 0.0, 0.0, title, src, fav, img, "website", deleted),
        )

    # Relationships (positions test intra-collection ordering).
    rels = [
        ("i3", "col-b", 1),
        ("i2", "col-a", 1),
        ("i1", "col-a", 2),
        ("i4", "col-a", 3),  # deleted item -> skipped
        ("i5", "col-a", 4),  # no url -> skipped
    ]
    for iid, pid, pos in rels:
        cur.execute(
            "INSERT INTO collections_items_relationship (item_id,parent_id,position) VALUES (?,?,?)",
            (iid, pid, pos),
        )

    con.commit()
    con.close()
    print("wrote", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    main()
