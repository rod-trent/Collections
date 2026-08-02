title: Collections Plus 2.5: recover what Edge left behind, and arrange everything your way

subtitle: Five requested updates to my free, local-first replacement for the retiring Edge Collections, including recovering your collections straight from Edge's leftover database even if you never exported them, interleaving folders and collections in one order, and shorter, cleaner rows. Still no account, still no server.

---

When Microsoft announced it's retiring **Edge Collections** (around Edge 149, mid-2026), I built **Collections Plus** to keep mine: a small, open, local-first browser extension that brings Collections back and then keeps going. Almost every feature since has come straight from what people asked for, and 2.5 is a whole batch of that at once. One reader sent me a tidy wishlist of five things, from a small nagging annoyance to a genuine rescue, and this release is all five.

The rescue is the one to lead with, because it's for the people I've been most worried about.

## Recover collections Edge already took away

Here's the scenario, and if it's you, you already know the sinking feeling. You heard Collections was going away, you went to move your data out, and you found out **too late**. Maybe your Edge already retired the feature. Maybe the pane just wasn't there anymore. Either way, the tidy path everyone recommends, "export `collections_export.csv` first," was never an option, because you never got the chance.

For a long time my honest answer was: I'm sorry, but if you didn't export, I can't help. That answer bothered me, and it turns out it was wrong.

The reader who flagged this dug in and found that **Edge doesn't actually delete your Collections when the feature goes**. It leaves the data sitting on your disk, in a small database file named `collectionsSQLite`, here:

```
%LOCALAPPDATA%\Microsoft\Edge\User Data\<your profile>\Collections\collectionsSQLite
```

(For most people `<your profile>` is `Default`.) That file is your collections, your saved pages, and their pictures, still there, just with no app left to open them.

So in 2.5, Collections Plus opens it. There's a new **Import Edge database (SQLite)…** in the **⋯ → Import** menu. Point it at that `collectionsSQLite` file and it rebuilds your library: every collection, every saved page, in order, and, unlike the CSV route, **with each page's preview image and site icon** too. The CSV never carried pictures; the database does, so this import actually looks like your old Collections instead of a bare list of links.

A couple of honest, practical notes:

- The file has **no extension**, so when the file picker opens, just browse to the `Collections` folder above and select `collectionsSQLite` directly. If your picker hides it, switch the picker to show "All files."
- This works **as long as the file is still on disk**. Edge currently leaves it behind, but if you've since cleared Edge's data or removed the profile, there may be nothing left to read. If it's there, this gets it back.
- It reads the file **entirely inside your browser** (more on that below).

If you thought your collections were gone, try this before you give up on them. There's a good chance they've been waiting for you the whole time.

### One small engineering aside

I'm a stickler about keeping this extension simple: no account, no server, and **no build step or bundled libraries**. Reading a SQLite database would normally mean pulling in a big third-party engine. I didn't want to do that, so Collections Plus reads the database's raw file format directly with a small, purpose-built reader I wrote for exactly this one job. Nothing extra to install, nothing new running in the background, same tiny local-first extension as before. It just happens to know how to read one more kind of file now.

## Arrange folders and collections in one order

Folders have been in Collections Plus for a while, but they had a quiet limitation: they always sat in the order you created them, and always **below** your loose collections. If you like to organize, that's frustrating, you couldn't put a folder where you wanted it, and you couldn't mix folders and collections together.

Now you can do both.

Hover a folder and you'll see a **drag handle** (the same grip the collection cards have). Grab it to **reorder your folders** however you like. And folders and your top-level collections now share **one order**, so you can **interleave** them: Folder A, then a loose Collection, then Folder B, then two more collections, in whatever arrangement makes sense to you. It's your list; arrange it your way.

(This applies in the default **manual** sort. If you switch the list to Newest or A–Z, it still groups things sensibly, because a computed sort is doing the ordering for you.)

Filing a collection *into* a folder still works exactly as it did, drag a card onto a folder header, so nothing you already know changed. There's just more room to arrange now.

## A tidier menu inside a collection

When you open a collection, its **⋯** menu had quietly grown into one long, flat list, everything from "Add a note" to "Export as Markdown" to "Move to Trash" stacked together. The main menu (the one outside a collection) had already been organized into neat categories, but this one hadn't caught up.

Now it has. The in-collection menu is grouped into submenus, **Add**, **Export & share**, **AI**, and **Manage**, matching the main menu, with the things you reach for most (Open all pages, Archive, Move to Trash) still one click away at the top and bottom. Same actions, far less scrolling.

## Turn off the reading list

Collections Plus has a built-in **reading list**: save a page and it starts "unread," collecting in the 📖 view until you open it or mark it read. Plenty of people love it. But if you don't use read-it-later at all, it was just noise, every new page showing up as one more thing to mark off.

So now you can switch it off. In **⋯ → Tools**, flip **Reading list: Off**. New pages stop being marked unread, and the 📖 button disappears from the toolbar. Nothing piles up waiting for you. Turn it back on any time and it picks right back up.

## Shorter, cleaner rows

This one's about the small daily paper-cut of scrolling.

The action icons on each saved page, rename, snapshot, move, and the rest, used to live in a tall column down the right side of every row. Even hidden until you hovered, that column **reserved a lot of vertical space**, so each row was much taller than it needed to be and you did more scrolling than you should have.

Those icons now sit in a compact row along the **bottom** of each item, which reclaims that wasted height on every single row. While I was in there, two more requested fixes:

- **Titles can wrap.** A long page title used to get cut off early with a "…", even when there was plenty of room. Titles now wrap to two lines, and the **full title still shows on hover** if it's longer than that, so you can actually read what you saved.
- **Compact mode is actually compact.** The "compact" toggle used to barely change anything. Now it does what it says: single-line titles, smaller thumbnails, genuinely tighter rows for when you want to see as much as possible at once.

And a tiny one from the same wishlist: the folder **collapse/expand arrow** is bigger now, so it's obvious and easy to hit.

## A quick note on privacy

The Edge database import is the one worth being explicit about, because it touches a file from your Edge profile.

That import happens **entirely inside your browser**. You pick the `collectionsSQLite` file yourself, Collections Plus reads it locally to rebuild your collections, and **nothing is sent anywhere**, no network request, nothing to me. I still run no server, collect nothing, and receive nothing. As always, your data lives in your browser, and every networked or AI feature stays off until you reach for it.

## Get it

It's free and open source (MIT).

**👉 [Install Collections Plus from the Chrome Web Store](https://chromewebstore.google.com/detail/collections-plus/eekpoobgfoollcmobjeeahonpbjjghia)**, one click, and it auto-updates from there. Works in Chrome and Edge.

Migrating from Edge takes one click: export your Collections and use **Import Edge CSV…**, or pull in your bookmarks with the built-in importer. And now, if you missed the export entirely, **Import Edge database (SQLite)…** can still get your collections back, pictures and all.

Source, issues, and ideas live on **[GitHub](https://github.com/rod-trent/Collections-Plus)**. This entire release came from one reader's list of five things they wished were different, from a menu that was too long to collections they thought they'd lost forever. Tell me what you want next, and if something ever goes wrong, tell me that too. It's how this thing keeps getting better.

Edge Collections is going away. Yours doesn't have to, and now, even if you thought you'd already lost it, there's a good chance you haven't.
