# Salinas Surf Club website

The website of Salinas Surf Club, a nonprofit. Kevin built it and is a club member; the club's volunteers edit it through `admin/` and `ask.html` and are not programmers. `README.md` describes how the site is put together.

## Rules

- The words, people and press live in `content/`. Photos live in `photos/`, and the content refers to them as `/photos/name.webp`. `render.js` turns the content into pages and `node build.js _site` builds the site.
- Before pushing anything changed by hand, run `npm test` and `node build.js _site`, and read what the build prints: "missing file" is a dead link, "skipped" is a file it could not read.
- Keep one renderer, with no dependencies. Keep links between the site's own pages relative, so the site works at any address.
- A new content field needs four things: `render.js` shows it, `admin/config.yml` gets a box for it, `ask.site.js` checks it if a wrong value would matter, and `guide.html` mentions it if the club needs to know. Claude on the Ask Claude page is told about the fields in the friend-sites kit (`servers/chat/src/sites/salinas-surf-club.js`).
- A push to `main` publishes the site about a minute later. Push to `main` only when Kevin has said to.
- The deploy workflow only builds. Do not add tests to it: a dead link or a bad content file must never stop a save from going live. The Instagram steps in it must never fail a deploy either.
- The donation links are where people's money goes. Do not loosen their checks.
- Claude on the Ask Claude page can read the web, so a web page can try to talk it into things. Two checks in `ask.site.js` hold whatever it is told: an extra page's body takes only plain formatting (`checkBody`), and a donation link only changes to one the person typed (`fromThePerson`). Do not loosen either.
- The repo and the site are public. Only real facts about the club go on the site: no made-up names, roles, numbers, sponsors or quotes, and no placeholder entries. Never commit private contact details, and never name a student without the club saying a parent is fine with it.
- Do not paste the text of news articles into the site. A press entry is a headline, a link and one line in the club's own words.
- A photo committed straight to `photos/` goes up as it is. Make it a WebP no more than 1800px on its longest side, with the phone's location data removed, first.
- `ask.html` and `ask.js` come from the friend-sites kit (`tools/sync.mjs`). Do not edit them here.
- The pages carry `noindex` until Kevin says the site is ready to be found (the robots line in `render.js`).
