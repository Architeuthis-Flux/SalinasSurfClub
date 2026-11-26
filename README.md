# Salinas Surf Club website

The website of Salinas Surf Club, a 501(c)(3) nonprofit that takes young people from East Salinas surfing. Static pages, no dependencies, published by GitHub Pages on every push to `main`.

```bash
npm test                 # self-checks: the renderer, the Instagram sync, what Ask Claude may touch
node build.js _site      # build the site into _site/
```

## How it is put together

- `content/` holds everything the club can change: `site.json` (home page and details used everywhere), `about.json`, `donate.json`, `contact.json`, one file per person in `team/`, one per article or film in `press/`, one per extra page in `pages/`. `design.css` holds design changes made through Ask Claude.
- `render.js` turns the content into pages. `build.js` runs it in Node; the Ask Claude page runs the same file in the browser to preview a change. Keep it one renderer.
- `site.css` is the look. The Surf cams page (`content/cams.json`, `cams.js`) also wears `console.css`, a copy of the console look from Kevin's slopswap repo written by its `.tools/console_copy.py`; change the look there and copy again, never here. `fonts/archivo.woff2` is Archivo (SIL Open Font License, see `fonts/OFL.txt`).
- `admin/` is the editor (Sveltia CMS): forms over the content files. `ask.html` is Ask Claude. `guide.html` explains both to the club.
- `ask.html` and `ask.js` are copies from Kevin's friend-sites kit. Do not edit them here. This site's own rules are in `ask.site.js`.
- `photos/` holds uploaded photos, and Instagram pictures saved as `ig-<post id>.jpg`.

## Donations

The Donate page shows the club's Zeffy form in a frame. Zeffy takes the payment and sends the tax receipt; this site never handles money. The Zeffy, Venmo and Zelle links are checked in three places (`render.js`, `ask.site.js`, `admin/config.yml`): each must be an https address on its own service, or it is not shown.

## Instagram

`.github/workflows/pages.yml` runs on every push and once a day. Before building, `scripts/sync-feed.mjs` fetches the club's feed from Behold (the `BEHOLD_FEED_URL` repo secret), saves new posts' pictures into `photos/` and lists them in `content/instagram.json`. Without the secret the step does nothing and the home page shows only the Follow button.

To set it up: the club's Instagram must be a professional account; make a free account at behold.so, connect the Instagram account, create a JSON feed, and store its address as the `BEHOLD_FEED_URL` secret (repo, Settings, Secrets and variables, Actions).
