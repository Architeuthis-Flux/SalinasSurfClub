#!/usr/bin/env node
// Build the Salinas Surf Club site into a folder.
//
//   node build.js _site      copy the photos, fonts, styles and editor, then write one page per
//                            section of the site from content/*.json
//   node build.js --test     self-check
//
// No dependencies. The pages themselves come from render.js, which the Ask Claude page also runs
// in the browser. The editor at admin/ (Sveltia CMS) and Ask Claude write the JSON this reads.
// The GitHub workflow runs this after every save and publishes _site/.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite, cssUrl, donateUrl, esc, instagramHandle, longDate, num, paras, rich, slugify, webUrl, zeffyEmbed } from "./render.js";

const SRC = dirname(fileURLToPath(import.meta.url));
const ASSETS = ["admin", "fonts", "guide.html", "receipt.html", "receipt.js", "ask.html", "ask.js", "ask.site.js", "ask.site.css",
  "render.js", "site.css", "logo.png"];   // published as they are; each must exist
const OPTIONAL = ["photos", "guide"];     // folders that exist only once they hold a file (git keeps no empty folders)
const DESIGN = "content/design.css";      // design overrides, published as design.css next to site.css
const PAGES = ["site", "about", "donate", "contact", "instagram"];   // content/<name>.json
const FOLDERS = ["team", "press", "pages"];                          // content/<name>/*.json

function readContent() {
  const files = new Map();
  for (const name of PAGES) {
    const path = join(SRC, "content", name + ".json");
    if (existsSync(path)) files.set(`content/${name}.json`, readFileSync(path, "utf8"));
  }
  for (const folder of FOLDERS) {
    const dir = join(SRC, "content", folder);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (name.endsWith(".json")) files.set(`content/${folder}/${name}`, readFileSync(join(dir, name), "utf8"));
    }
  }
  return files;
}

// Hash of the stylesheets, appended as ?v= so a changed file is never served stale.
function version() {
  const hash = createHash("sha1");
  for (const name of ["site.css", DESIGN]) hash.update(readFileSync(join(SRC, name)));
  return hash.digest("hex").slice(0, 8);
}

function copyAssets(out) {
  mkdirSync(out, { recursive: true });
  if (resolve(out) === SRC) return;
  for (const name of [...ASSETS, ...OPTIONAL.filter((n) => existsSync(join(SRC, n)))]) {
    const from = join(SRC, name);
    if (statSync(from).isDirectory()) cpSync(from, join(out, name), { recursive: true });
    else copyFileSync(from, join(out, name));
  }
  copyFileSync(join(SRC, DESIGN), join(out, "design.css"));
}

const unescape = (text) => text.replaceAll("&quot;", '"').replaceAll("&#x27;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");

// Local href/src targets in the built pages that do not exist.
function brokenLinks(out) {
  const bad = [];
  for (const page of readdirSync(out).filter((name) => name.endsWith(".html"))) {
    for (const [, raw] of readFileSync(join(out, page), "utf8").matchAll(/(?:href|src)="([^"]+)"/g)) {
      const ref = unescape(raw).split("#")[0].split("?")[0];
      if (!ref || /^[a-z]+:/.test(ref) || ref.startsWith("//")) continue;
      const target = join(out, ref);
      if (!(existsSync(target) || existsSync(join(SRC, ref)) || ref === "design.css")) bad.push(`${page} -> ${ref}`);
    }
  }
  return bad;
}

function build(out) {
  const { pages, team, press, extraPages } = buildSite({
    files: readContent(),
    hasPhoto: (name) => existsSync(join(SRC, "photos", name)),
    version: version(),
    warn: (message) => console.error("surfclub: " + message),
  });
  mkdirSync(out, { recursive: true });
  for (const [name, html] of pages) writeFileSync(join(out, name), html);
  const bad = brokenLinks(out);
  for (const b of bad) console.error("surfclub: missing file:", b);
  console.log(`surfclub: built ${pages.size} pages (${team.length} team, ${press.length} press, ${extraPages.length} extra pages)`);
  return bad;
}

function selftest() {
  assert.equal(esc(`<a href="x">Tom & Jerry's</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#x27;s&lt;/a&gt;");
  assert.equal(esc(null), "");
  assert.equal(slugify("Jeff Smallwood"), "jeff-smallwood");
  assert.equal(paras("a <b>\n\n c"), "<p>a &lt;b&gt;</p><p>c</p>");
  assert.equal(paras(null), "");
  assert.deepEqual([num("2"), num(null), num("x"), num(3)], [2, 0, 0, 3]);
  assert.equal(rich('<p><img src="/photos/a.webp" alt=""></p>'), '<p><img src="photos/a.webp" alt=""></p>');
  assert.deepEqual([longDate("2026-10-01"), longDate("2020-01-14T09:58:40"), longDate("2020"), longDate("2026-13-01"), longDate(null)],
    ["October 1, 2026", "January 14, 2020", "2020", "2026-13-01", ""]);
  assert.equal(webUrl("https://youtu.be/x"), "https://youtu.be/x");
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "youtu.be/x", "", null]) assert.equal(webUrl(bad), "", String(bad));

  // The donation links: https, on the service each is named for, and nothing else.
  assert.ok(donateUrl("zeffy_url", "https://www.zeffy.com/en-US/donation-form/donate-to-salinas-surf-club"));
  assert.ok(donateUrl("venmo_url", "https://www.venmo.com/u/salinassurfclub"));
  assert.ok(donateUrl("zelle_url", "https://enroll.zellepay.com/qr-codes?data=abc="));
  for (const [key, bad] of [
    ["zeffy_url", "http://www.zeffy.com/donation-form/x"], ["zeffy_url", "https://www.zeffy.com.evil.example/donation-form/x"],
    ["zeffy_url", "https://evil.example/www.zeffy.com"], ["zeffy_url", "https://www.zeffy.com@evil.example/x"],
    ["venmo_url", "https://www.zeffy.com/donation-form/x"], ["venmo_url", "javascript:alert(1)"], ["zelle_url", ""], ["zelle_url", null],
    ["other_url", "https://www.venmo.com/u/x"],
  ]) assert.equal(donateUrl(key, bad), "", `${key} ${bad}`);
  assert.equal(zeffyEmbed("https://www.zeffy.com/en-US/donation-form/donate-to-salinas-surf-club"), "https://www.zeffy.com/embed/donation-form/donate-to-salinas-surf-club");
  assert.equal(zeffyEmbed("https://www.zeffy.com/donation-form/x-1/"), "https://www.zeffy.com/embed/donation-form/x-1");
  assert.equal(zeffyEmbed("https://www.zeffy.com/en-US/ticketing/x"), "");
  assert.equal(zeffyEmbed("https://evil.example/donation-form/x"), "");
  assert.equal(cssUrl('photos/a b").x{y}\\.jpg'), "photos/a%20b%22%29.x{y}%5c.jpg");
  assert.deepEqual([instagramHandle("salinas_surf_club"), instagramHandle("a/b"), instagramHandle(""), instagramHandle(null)], ["salinas_surf_club", "", "", ""]);

  // A made-up site: ordering, the menu, a reserved name, a broken file, a missing photo, bad links, escaping.
  const files = new Map(Object.entries({
    "content/site.json": JSON.stringify({ name: "Test & Club", headline: "One\nTwo <i>", email: "a@b.org", instagram: "test_club", mission: "First.\n\nSecond.", facts: [{ title: "F", text: "x\n\ny" }], day: [{ title: "D1", text: "z" }], feed_title: "Feed", tax_id: "12-3456789", volunteer_photos: ["/photos/v.webp", "/photos/gone-v.jpg", "https://evil.example/v.jpg", 7] }),
    "content/about.json": JSON.stringify({ title: "About us", body: "Story <b>" }),
    "content/donate.json": JSON.stringify({ title: "Give", zeffy_url: "https://www.zeffy.com/en-US/donation-form/test", venmo_url: "https://evil.example/venmo", zelle_url: "https://enroll.zellepay.com/qr-codes?data=x", zelle_to: "a@b.org" }),
    "content/contact.json": "{ not json",
    "content/instagram.json": JSON.stringify({ posts: [
      { permalink: "https://www.instagram.com/p/AbC-1_x/", image: "/photos/ig-AbC-1_x.jpg", caption: "Hello\n<world>" },
      { permalink: "https://evil.example/p/x/", image: "/photos/ig-AbC-1_x.jpg" },
      { permalink: "https://www.instagram.com/p/gone/", image: "/photos/gone.jpg" },
      "nonsense",
    ] }),
    "content/team/b-second.json": JSON.stringify({ title: "Second <i>", order: 2, role: "Volunteer", photo: "/photos/a.webp" }),
    "content/team/a-first.json": JSON.stringify({ title: "First", order: 0, photo: "/photos/gone.jpg" }),
    "content/team/c-chair.json": JSON.stringify({ title: "Chair", order: 5, group: "board" }),
    "content/team/broken.json": "{ not json",
    "content/press/old.json": JSON.stringify({ title: "Old", date: "2020-01-14", kind: "Film", url: "https://youtu.be/abcDEF_1234", outlet: "Out" }),
    "content/press/new.json": JSON.stringify({ title: "New", date: "2026-10-01", kind: "Article", url: "javascript:alert(1)", cover: "http://plain.example/x.jpg" }),
    "content/press/mid.json": JSON.stringify({ title: "Mid", date: "2022-12-12", cover: "https://pics.example/y.jpg?a=1&b=2" }),
    "content/pages/sponsors.json": JSON.stringify({ title: "Our Sponsors", body: '<p><img src="/photos/a.webp"></p>' }),
    "content/pages/hidden.json": JSON.stringify({ title: "Hidden", menu: false }),
    "content/pages/donate.json": JSON.stringify({ title: "Would overwrite the Donate page" }),
  }));
  const warnings = [];
  const made = buildSite({ files, hasPhoto: (name) => !name.startsWith("gone"), version: "v1", year: 2026, warn: (m) => warnings.push(m) });
  assert.deepEqual([...made.pages.keys()], ["index.html", "about.html", "team.html", "press.html", "donate.html", "contact.html", "hidden.html", "sponsors.html"]);
  assert.equal(warnings.length, 3);                                       // contact.json, team/broken.json, the page named donate
  const index = made.pages.get("index.html");
  assert.ok(index.includes("<span>One</span> <span>Two &lt;i&gt;</span>"));
  assert.ok(index.includes('<a href="sponsors.html">Our Sponsors</a>') && !index.includes("hidden.html"));
  assert.ok(index.includes('<a href="team.html">Team</a>') && index.includes('<a href="press.html">Press</a>'));
  assert.ok(index.includes("<p>x</p><p>y</p>") && !index.includes("data-edit"));
  assert.ok(index.includes('href="https://www.instagram.com/p/AbC-1_x/"') && index.includes('alt="Hello &lt;world&gt;"'));
  assert.ok(!index.includes("evil.example") && !index.includes("gone"));               // a post from elsewhere, and one whose picture is missing
  const team = made.pages.get("team.html");
  assert.ok(team.indexOf("Board and leadership") < team.indexOf(">Chair<") && team.indexOf(">Chair<") < team.indexOf(">Volunteers<"));   // the board first
  assert.ok(team.indexOf(">Volunteers<") < team.indexOf("Second &lt;i&gt;") && team.indexOf("Second &lt;i&gt;") < team.indexOf(">First<"));   // then volunteers, the one with a photo first
  assert.ok(!team.includes("gone.jpg"));
  assert.ok(team.indexOf(">First<") < team.indexOf('<div class="gallery"><a href="photos/v.webp"><img src="photos/v.webp" alt="Volunteers, photo 1"') && !team.includes("gone-v") && !team.includes("evil.example"));   // then the volunteers' photos, with no names
  const press = made.pages.get("press.html");
  assert.ok(press.indexOf(">New<") < press.indexOf(">Old<"));                           // newest first
  assert.ok(press.includes("October 1, 2026") && press.includes("Watch the film") && !press.includes("javascript:"));
  assert.ok(press.includes('url(&quot;https://i.ytimg.com/vi/abcDEF_1234/hqdefault.jpg&quot;)'));       // a YouTube link brings its own picture
  assert.ok(press.includes('url(&quot;https://pics.example/y.jpg?a=1&amp;b=2&quot;)') && !press.includes("plain.example"));   // https only
  const donate = made.pages.get("donate.html");
  assert.ok(donate.includes('src="https://www.zeffy.com/embed/donation-form/test"'));
  assert.ok(donate.includes("enroll.zellepay.com") && !donate.includes("evil.example") && donate.includes("Tax ID: 12-3456789"));
  assert.ok(made.pages.get("contact.html").includes('href="mailto:a@b.org"'));         // its own file is broken; the page still stands
  assert.ok(made.pages.get("sponsors.html").includes('<img src="photos/a.webp">'));
  const empty = buildSite({ files: new Map([["content/site.json", JSON.stringify({ name: "Bare" })]]), hasPhoto: () => false });
  assert.ok(!empty.pages.get("index.html").includes("team.html") && !empty.pages.get("index.html").includes('class="feed"'));
  const preview = buildSite({ files, hasPhoto: () => true, photoUrl: (name) => "blob:" + name, preview: true });
  assert.ok(preview.pages.get("index.html").includes('data-edit="content/site.json#headline"'));
  assert.ok(preview.pages.get("team.html").includes('src="blob:a.webp"'));
  assert.ok(!preview.pages.get("donate.html").includes("<iframe"));                     // the preview cannot run the form

  // The real site builds, and nothing it links to is missing.
  const tmp = mkdtempSync(join(tmpdir(), "surfclub-"));
  try {
    copyAssets(tmp);
    const bad = build(tmp);
    assert.deepEqual(bad, []);
    assert.ok(readFileSync(join(tmp, "index.html"), "utf8").includes('href="donate.html"'));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log("ok");
}

const arg = process.argv[2];
if (process.argv.length !== 3) {
  console.error("usage: node build.js <outdir> | --test");
  process.exit(1);
} else if (arg === "--test") {
  selftest();
} else {
  copyAssets(arg);
  build(arg);
}
