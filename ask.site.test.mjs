// Self-check for what Claude may touch on this site:  npm test
// The rules are in ask.site.js (this site's) and ask.js (the same on every site).
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { checkPath, checkContent, label, pageFor, photoRefs, uniqueName, DESIGN, TOOL_NAMES } from "./ask.js";
import { hint } from "./ask.site.js";
import { buildSite } from "./render.js";

const FEED = "content/instagram.json";

// Content files, and the design file, can be read and written.
for (const ok of ["content/site.json", "content/about.json", "content/donate.json", "content/contact.json", "content/cams.json",
  "content/team/jeff-smallwood.json", "content/press/lessons-in-the-waves.json", "content/pages/our-sponsors.json", "content/team/a1.json", DESIGN]) {
  assert.equal(checkPath(ok), "", ok);
  assert.equal(checkPath(ok, { reading: true }), "", ok);
}
// The main stylesheet and the Instagram posts can be read, never written or deleted.
assert.equal(checkPath("site.css", { reading: true }), "");
assert.notEqual(checkPath("site.css"), "");
assert.equal(checkPath(FEED, { reading: true }), "");
assert.notEqual(checkPath(FEED), "");
assert.notEqual(checkPath(FEED, { deleting: true }), "");
// Code, settings, the workflow and anything reached by a path trick are out of reach, for reading and writing alike.
for (const bad of [
  "build.js", "render.js", "ask.js", "ask.site.js", "package.json", "admin/config.yml", "admin/index.html", "scripts/sync-feed.mjs",
  ".github/workflows/pages.yml", "photos/ig-abc.jpg", "design.css", "logo.png", "CNAME", "content/design.css/../../build.js",
  "content/../site.css", "content/design.js", "content/team/../design.css", "content/site.json/../../build.js",
  "content/team/../site.json", "/content/site.json", "content/Site.json", "content/team/Jeff-Smallwood.json", "content/team/a b.json",
  "content/team/jeff--smallwood.json", "content/press/-x.json", "content/press/x.json.bak", "content/other/x.json", "content/other.json",
  "content/team/x/y.json", "content/site.yml", "content/__proto__.json", "constructor", "__proto__", "", null, 42, {},
]) {
  assert.notEqual(checkPath(bad), "", "write " + String(bad));
  assert.notEqual(checkPath(bad, { reading: true }), "", "read " + String(bad));
}
// An extra page cannot take a name the site itself uses.
for (const taken of ["index", "about", "team", "press", "donate", "contact", "cams", "guide", "ask"]) assert.notEqual(checkPath(`content/pages/${taken}.json`), "", taken);
assert.equal(checkPath("content/team/about.json"), "");                       // a person's file is not a page, so no clash
// The fixed pages and the design file cannot be deleted; entries can.
for (const fixed of ["content/site.json", "content/about.json", "content/donate.json", "content/contact.json", "content/cams.json", DESIGN]) assert.notEqual(checkPath(fixed, { deleting: true }), "", fixed);
for (const entry of ["content/team/jeff-smallwood.json", "content/press/x.json", "content/pages/our-sponsors.json"]) assert.equal(checkPath(entry, { deleting: true }), "", entry);

// The content files as they are in the repo pass their own checks.
const here = (path) => new URL(path, import.meta.url);
for (const name of ["site", "about", "donate", "contact", "cams"]) assert.equal(checkContent(`content/${name}.json`, readFileSync(here(`content/${name}.json`), "utf8")), "", name);
for (const folder of ["team", "press", "pages"].filter((f) => existsSync(here(`content/${f}/`)))) {   // git keeps no empty folder, so "pages" exists only once the club adds a page
  for (const name of readdirSync(here(`content/${folder}/`)).filter((n) => n.endsWith(".json"))) {
    const path = `content/${folder}/${name}`;
    assert.equal(checkPath(path), "", path);
    assert.equal(checkContent(path, readFileSync(here(path), "utf8")), "", path);
  }
}

// Each kind of bad value is refused.
const site = (extra) => JSON.stringify({ name: "Salinas Surf Club", ...extra });
assert.equal(checkContent("content/site.json", site({ email: "admin@salinassurfclub.org", instagram: "salinas_surf_club", facts: [{ title: "A", text: "b" }], volunteer_photos: ["/photos/a.webp", "/photos/b c.jpg"] })), "");
assert.equal(checkContent("content/site.json", site({ email: "", instagram: "" })), "");
for (const bad of [{ name: " " }, { email: "not an email" }, { email: "a@b" }, { instagram: "@salinas_surf_club" }, { instagram: "https://instagram.com/x" },
  { headline: ["Surf"] }, { facts: "x" }, { facts: [{ text: "no title" }] }, { day: [{ title: "T" }] },
  { volunteer_photos: "/photos/a.webp" }, { volunteer_photos: ["https://example.org/a.jpg"] }, { volunteer_photos: ["/photos/x/a.webp"] }, { volunteer_photos: [{ src: "/photos/a.webp" }] }]) {
  assert.notEqual(checkContent("content/site.json", site(bad)), "", JSON.stringify(bad));
}
// The donation links: only https, only on the service each is named for.
const give = (extra) => JSON.stringify({ title: "Donate", ...extra });
assert.equal(checkContent("content/donate.json", give({ zeffy_url: "https://www.zeffy.com/en-US/donation-form/donate-to-salinas-surf-club", venmo_url: "https://www.venmo.com/u/salinassurfclub", zelle_url: "https://enroll.zellepay.com/qr-codes?data=x", ways: [] })), "");
assert.equal(checkContent("content/donate.json", give({ zeffy_url: "", venmo_url: "" })), "");
for (const bad of [
  { zeffy_url: "https://evil.example/donation-form/donate-to-salinas-surf-club" }, { zeffy_url: "http://www.zeffy.com/donation-form/x" },
  { zeffy_url: "https://www.zeffy.com.evil.example/x" }, { zeffy_url: "https://www.zeffy.com@evil.example/x" }, { zeffy_url: "javascript:alert(1)" },
  { venmo_url: "https://www.zeffy.com/donation-form/x" }, { venmo_url: "https://venmo.com.evil.example/u/x" }, { venmo_url: "venmo.com/u/salinassurfclub" },
  { zelle_url: "https://www.zellepay.com/x" }, { zelle_url: 42 }, { ways: [{ text: "no title" }] },
]) {
  assert.notEqual(checkContent("content/donate.json", give(bad)), "", JSON.stringify(bad));
}
// The surf cams: a feed must be exactly what its kind takes, so nothing else can be put in a frame on the club's page.
const cam = (extra) => JSON.stringify({ title: "Surf cams", cams: [{ name: "Reef", kind: "youtube", source: "fVa6-zCBR7A", ...extra }] });
assert.equal(checkContent("content/cams.json", cam({ far: true })), "");
assert.equal(checkContent("content/cams.json", cam({ kind: "link", source: undefined, link: "https://www.surfline.com/x", lat: 36.6, lon: -121.8 })), "");
assert.equal(checkContent("content/cams.json", cam({ kind: "hls", source: "https://video.parks.ca.gov/Seacliff/Seacliff.stream/playlist.m3u8" })), "");
assert.equal(checkContent("content/cams.json", '{"title": "Surf cams"}'), "");
assert.equal(checkContent("content/cams.json", cam({ kind: "image", source: undefined, views: [{ name: "Left", source: "https://pics.example/l.jpg" }, { name: "Right", source: "https://pics.example/r.jpg" }] })), "");
assert.equal(pageFor("content/cams.json"), "cams.html");
for (const bad of [{ name: "" }, { kind: "frame" }, { kind: "iframe", source: "https://evil.example/" }, { source: "https://www.youtube.com/watch?v=fVa6-zCBR7A" },
  { kind: "hls", source: "https://evil.example/a.m3u8" }, { kind: "image", source: "http://pics.example/a.jpg" }, { kind: "hdrelay", source: "not-a-player-id" },
  { kind: "link", source: undefined }, { kind: "link", link: "javascript:alert(1)" }, { link: "javascript:alert(1)" }, { lat: "36.6" }, { lon: 500 }, { far: "yes" },
  { views: "both" }, { kind: "image", views: [{ name: "Left", source: "http://pics.example/l.jpg" }] }, { kind: "image", views: [{ source: "https://pics.example/l.jpg" }] }, { kind: "link", link: "https://x.example/", views: [{ name: "A", source: "https://pics.example/a.jpg" }] }]) {
  assert.notEqual(checkContent("content/cams.json", cam(bad)), "", JSON.stringify(bad));
}
assert.notEqual(checkContent("content/cams.json", '{"cams": "all of them"}'), "");
assert.notEqual(checkContent("content/cams.json", '{"cams": ["Reef"]}'), "");
// Entries.
assert.equal(checkContent("content/team/x.json", '{"title": "X", "order": 2}'), "");
assert.notEqual(checkContent("content/team/x.json", '{"title": "  "}'), "");
assert.notEqual(checkContent("content/team/x.json", "{}"), "");
assert.notEqual(checkContent("content/team/x.json", '{"title": "X", "order": -1}'), "");
assert.notEqual(checkContent("content/team/x.json", '{"title": "X", "order": "first"}'), "");
assert.equal(checkContent("content/team/x.json", '{"title": "X", "group": "board"}'), "");
assert.notEqual(checkContent("content/team/x.json", '{"title": "X", "group": "admins"}'), "");
for (const link of ["cams.html", "about.html", "https://chrispowersprint.com/", ""]) assert.equal(checkContent("content/team/x.json", JSON.stringify({ title: "X", link })), "", link);
for (const link of ["javascript:alert(1)", "/cams.html", "../admin/", "cams", "Cams.html", "cams.html#x", "//evil.example/a.html", 7]) assert.notEqual(checkContent("content/team/x.json", JSON.stringify({ title: "X", link })), "", String(link));
assert.equal(checkContent("content/press/x.json", '{"title": "X", "url": "https://youtu.be/x", "date": "2026-10-01", "kind": "Film"}'), "");
assert.equal(checkContent("content/press/x.json", '{"title": "X", "date": "2020"}'), "");
assert.notEqual(checkContent("content/press/x.json", '{"title": "X", "url": "javascript:alert(1)"}'), "");
assert.notEqual(checkContent("content/press/x.json", '{"title": "X", "url": "youtu.be/x"}'), "");
assert.notEqual(checkContent("content/press/x.json", '{"title": "X", "date": "October 1"}'), "");
assert.notEqual(checkContent("content/press/x.json", '{"title": "X", "kind": "Podcast"}'), "");
assert.equal(checkContent("content/press/x.json", '{"title": "X", "cover": "https://example.org/a.jpg"}'), "");
assert.equal(checkContent("content/press/x.json", '{"title": "X", "cover": ""}'), "");
assert.notEqual(checkContent("content/press/x.json", '{"title": "X", "cover": "http://example.org/a.jpg"}'), "");
assert.notEqual(checkContent("content/press/x.json", '{"title": "X", "cover": "javascript:alert(1)"}'), "");
assert.notEqual(checkContent("content/press/x.json", '{"title": "X", "cover": "/photos/../build.js"}'), "");
assert.notEqual(checkContent("content/pages/x.json", "{}"), "");
// An extra page's body: plain formatting only. Claude reads web pages, and nothing it read may put a script on the site.
const page = (body) => JSON.stringify({ title: "Our Sponsors", body });
for (const body of ["", "Thank you.", "<p>Thank you to <strong>everyone</strong>.<br>See you <em>Saturday</em>.</p>", '<h2>Sponsors</h2><ul><li><a href="https://example.org/a?b=1&amp;c=2">One</a></li><li><a href="about.html">About us</a></li><li><a href="#top">Top</a></li><li><a href="mailto:admin@salinassurfclub.org">Write to us</a></li></ul>',
  '<figure><img src="/photos/a.webp" alt="Kids on the sand"><figcaption>Saturday</figcaption></figure>', "<table>\n<thead><tr><th>Day</th></tr></thead><tbody><tr><td>Saturday</td></tr></tbody></table><hr />", "<p>Under 12 &lt; free</p>"]) {
  assert.equal(checkContent("content/pages/x.json", page(body)), "", body);
}
for (const body of ["<script>alert(1)</script>", '<script src="https://evil.example/x.js"></script>', "<SCRIPT>alert(1)</SCRIPT>", "<p>a</p><script", '<img src="/photos/a.webp" onerror="alert(1)">', '<p onclick="alert(1)">a</p>',
  '<a href="javascript:alert(1)">a</a>', '<a href="java\tscript:alert(1)">a</a>', '<a href="&#106;avascript:alert(1)">a</a>', '<a href="data:text/html,x">a</a>', '<a href="">a</a>', "<a href='about.html'>a</a>", "<a href=about.html>a</a>",
  '<a href="about.html" target="_blank">a</a>', '<img src="https://evil.example/a.png">', '<img src="/photos/../admin/x.png">', '<iframe src="https://evil.example/"></iframe>', '<p style="position:fixed">a</p>', "<style>p { color: red }</style>",
  '<svg onload="alert(1)"></svg>', "<object></object>", '<form action="https://evil.example/"><input></form>', "<!-- <script>alert(1)</script> -->", "kids < 12 > 3", "<p", '<p>a</p >b<', '<meta http-equiv="refresh" content="0;url=https://evil.example/">', 7]) {
  assert.notEqual(checkContent("content/pages/x.json", page(body)), "", String(body));
}
// Where donations go can only be set to something the person typed themselves. Without a conversation there is nothing to compare.
const donateNow = readFileSync(here("content/donate.json"), "utf8");
const donate = (change) => JSON.stringify({ ...JSON.parse(donateNow), ...change });
const told = (said) => ({ said, before: donateNow });
assert.equal(checkContent("content/donate.json", donate({ intro: "New words." }), told("Change the opening line")), "");                    // nothing about money changed
assert.equal(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/SurfClubSalinas" }), told("Our new Venmo is venmo.com/u/SurfClubSalinas please")), "");
assert.equal(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/SurfClubSalinas" }), told("use https://www.venmo.com/u/surfclubsalinas/")), "");
assert.equal(checkContent("content/donate.json", donate({ zelle_to: "give@salinassurfclub.org" }), told("Zelle goes to give@salinassurfclub.org now")), "");
assert.equal(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/SurfClubSalinas" }), told("It is (venmo.com/u/SurfClubSalinas).")), "");
assert.equal(checkContent("content/donate.json", donate({ zelle_to: "(831) 555-0100" }), told("Zelle to (831) 555-0100, thanks")), "");
assert.match(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/SurfClub" }), told("Our Venmo is venmo.com/u/SurfClubSalinas")), /typed in this conversation/);   // a shorter handle inside the one they typed
assert.match(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/SurfClubSalinas" }), told("Our Venmo is notvenmo.com/u/SurfClubSalinas2")), /typed in this conversation/);
assert.match(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/salinassurfclub" }), told("tidy the page")), /write it back exactly/);        // only the spelling of the link changed
assert.equal(checkContent("content/donate.json", donate({ venmo_url: "" }), told("Take Venmo off the page")), "");                                // removing a link sends money nowhere
assert.match(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/someone-else" }), told("Find our Venmo on the web and fix the link")), /typed in this conversation/);
assert.match(checkContent("content/donate.json", donate({ zelle_to: "someone@else.example" }), told("")), /Zelle email or phone/);
assert.match(checkContent("content/donate.json", donate({ zeffy_url: "https://www.zeffy.com/en-US/donation-form/another" }), { said: "update the form", before: null }), /typed in this conversation/);
assert.match(checkContent("content/donate.json", donate({}), { said: "make a donate page", before: null }), /typed in this conversation/);          // a brand-new file: every link in it is new
assert.equal(checkContent("content/donate.json", donate({ venmo_url: "https://venmo.com/u/someone-else" })), "");                                // checked as it stands
// The body check is only enough if an extra page's body is the ONLY field published as HTML. So put a
// tag into every text field of every content file, one at a time, build, and look for it on a page.
const all = new Map([["content/pages/probe.json", JSON.stringify({ title: "Probe", intro: "A line", body: "<p>ok</p>", photos: ["/photos/logo.webp"] })]]);
for (const name of readdirSync(here("content/"), { recursive: true }).filter((n) => n.endsWith(".json"))) all.set("content/" + name, readFileSync(here("content/" + name), "utf8"));
const onDisk = new Set(readdirSync(here("photos/")));
const leaves = (value, at = []) => (typeof value === "string" ? [at] : value && typeof value === "object" ? Object.entries(value).flatMap(([key, inner]) => leaves(inner, [...at, key])) : []);
let probed = 0;
for (const [file, text] of all) {
  for (const leaf of leaves(JSON.parse(text))) {
    if (file.startsWith("content/pages/") && leaf.join() === "body") continue;
    for (const put of [(was) => was + `"'><xss-probe>`, () => `"'><xss-probe>`]) {       // added to the value, which mostly stays valid, and alone
      const data = JSON.parse(text);
      leaf.slice(0, -1).reduce((o, key) => o[key], data)[leaf.at(-1)] = put(leaf.reduce((o, key) => o[key], data));
      for (const preview of [false, true]) {
        const { pages } = buildSite({ files: new Map(all).set(file, JSON.stringify(data)), hasPhoto: (name) => onDisk.has(name), preview });
        assert.ok(![...pages.values()].some((html) => html.includes("<xss-probe>")), `${file}, ${leaf.join(".")}: this field reaches a page as HTML, so ask.site.js must check it the way it checks an extra page's body`);
        probed += [...pages.values()].some((html) => html.includes("xss-probe"));
      }
    }
  }
}
assert.ok(probed > 300, "the probe should reach the pages, escaped, in most fields");

// Not JSON, or not an object.
assert.notEqual(checkContent("content/site.json", '{"name": '), "");
assert.notEqual(checkContent("content/site.json", "[]"), "");
assert.notEqual(checkContent("content/site.json", "null"), "");
assert.notEqual(checkContent("content/team/x.json", ".a { color: red; }"), "");

// Design overrides: plain CSS, nothing from elsewhere, nothing that could break out of a style block.
assert.equal(checkContent(DESIGN, ".btn.give { font-size: 1.2rem; }\n/* a } in a comment */\n.hero::after { content: \"}\"; }"), "");
assert.equal(checkContent(DESIGN, ""), "");
assert.equal(checkContent(DESIGN, ".hero { background: url(photos/beach.webp); }"), "");
assert.notEqual(checkContent(DESIGN, ".a { color: red; "), "");
assert.notEqual(checkContent(DESIGN, ".a { color: red; } }"), "");
assert.notEqual(checkContent(DESIGN, "</style><script>alert(1)</script>"), "");
assert.notEqual(checkContent(DESIGN, "@import url(evil.css);"), "");
assert.notEqual(checkContent(DESIGN, ".a { background: url(https://example.com/x.png); }"), "");
assert.notEqual(checkContent(DESIGN, ".a { background: url(data:image/png;base64,AAAA); }"), "");
assert.notEqual(checkContent(DESIGN, "x".repeat(60_001)), "");

assert.equal(label(DESIGN), "Design");
assert.equal(label("site.css"), "Main stylesheet");
assert.equal(label("content/site.json"), "Home page and site details");
assert.equal(label("content/donate.json"), "Donate page");
assert.equal(label("content/team/jeff-smallwood.json", "Jeff Smallwood"), "Team: Jeff Smallwood");
assert.equal(label("content/press/lessons-in-the-waves.json"), "Press: lessons-in-the-waves");
assert.equal(label("content/pages/our-sponsors.json", "Our Sponsors"), "Page: Our Sponsors");
assert.equal(pageFor("content/site.json"), "index.html");
assert.equal(pageFor("content/about.json"), "about.html");
assert.equal(pageFor("content/donate.json"), "donate.html");
assert.equal(pageFor("content/contact.json"), "contact.html");
assert.equal(pageFor("content/team/jeff-smallwood.json"), "team.html");
assert.equal(pageFor("content/press/x.json"), "press.html");
assert.equal(pageFor("content/pages/our-sponsors.json"), "our-sponsors.html");
assert.equal(pageFor(DESIGN), "");

// Uploaded photos get a plain, unused file name.
assert.equal(uniqueName("IMG_4821.HEIC", "webp", () => false), "img-4821.webp");
const used = new Set(["lineup.webp", "lineup-2.webp"]);
assert.equal(uniqueName("lineup.png", "webp", (n) => used.has(n)), "lineup-3.webp");

// Finding the photos a file points at, so a write that names a missing one can be refused.
assert.deepEqual(photoRefs('{"photo": "/photos/a.webp", "photos": ["/photos/b-2.jpg", "/photos/a.webp"], "body": "<img src=\\"/photos/c.png\\">"}'), ["a.webp", "b-2.jpg", "c.png"]);
assert.deepEqual(photoRefs('{"title": "No photos here"}'), []);

assert.deepEqual(TOOL_NAMES, ["list_site_files", "read_file", "write_file", "delete_file"]);

// The suggestion in an empty conversation follows what the team page still needs.
const person = (title, more = {}) => JSON.stringify({ title, role: "Volunteer", photo: "/photos/x.webp", bio: "Shows up every Saturday.", ...more });
const teamOf = (...people) => new Map(people.map((text, i) => [`content/team/p${i}.json`, text]));
const board = (n) => Array.from({ length: n }, (_, i) => person("Board " + i, { group: "board" }));
assert.match(hint(new Map()), /board members/);
assert.match(hint(new Map(readdirSync("content/team").map((f) => ["content/team/" + f, readFileSync("content/team/" + f, "utf8")]))), /^You can do things like: /);   // the site as it is today, whatever the club has changed
assert.match(hint(teamOf(...board(3))), /board members/);
assert.match(hint(teamOf(...board(4), person("Ana", { photo: "" }), person("Ben", { photo: undefined }))), /drag photos of Ana and Ben onto this chat/);
assert.match(hint(teamOf(...board(4), ...["A", "B", "C", "D", "E"].map((n) => person(n, { photo: "" })))), /photos of A, B, C, D and the others who have none/);
assert.match(hint(teamOf(...board(4), person("Cy", { bio: "" }), person("Di", { bio: undefined }))), /a sentence or two about Cy and Di, so everyone/);
assert.match(hint(teamOf(...board(4).map((p) => p.replace("Shows up every Saturday.", "")))), /Add a new person/);   // nobody has a bio: that is even, so nothing to ask
assert.match(hint(teamOf(...board(4))), /Add a new person to the team page/);
assert.match(hint(teamOf(...board(4), "{ not json", "null", "[]", '{"role":"no name"}')), /Add a new person/);     // broken files are skipped, never thrown on
assert.match(hint(new Map([["content/site.json", "{ not json"], ...teamOf(...board(4))])), /Add a new person/);
console.log("ok (what Claude may touch)");
