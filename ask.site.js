// What is particular to this site in the Ask Claude panel. The panel itself (ask.html, ask.js)
// is the same on every site and comes from the friend-sites kit; do not edit those here.
// Checked by ask.site.test.mjs (npm test).

import { buildSite, camSource, donateUrl, instagramHandle, personLink, webUrl, CAM_KIND_NAMES, RESERVED } from "./render.js";

// One file per fixed page: path -> [what the "Ready to publish" list calls it, the preview page that shows it].
const SINGLE = new Map([
  ["content/site.json", ["Home page and site details", "index.html"]],
  ["content/about.json", ["About page", "about.html"]],
  ["content/donate.json", ["Donate page", "donate.html"]],
  ["content/contact.json", ["Contact page", "contact.html"]],
  ["content/cams.json", ["Surf cams page", "cams.html"]],
]);
const FEED = "content/instagram.json";                 // filled in by the daily Instagram job: readable, never writable here
const ENTRY = /^content\/(team|press|pages)\/[a-z0-9]+(-[a-z0-9]+)*\.json$/;
const KINDS = { team: "Team", press: "Press", pages: "Page" };
const folderOf = (path) => path.split("/")[1];
const slugOf = (path) => path.split("/").pop().replace(/\.json$/, "");
const PAGE_TITLES = { "index.html": "Home page", "about.html": "About", "team.html": "Team", "press.html": "Press", "donate.html": "Donate", "contact.html": "Contact", "cams.html": "Surf cams" };

/* ---- what a content file must look like. Each check gives "" or the problem, in words Claude
   can act on. Strictest where a wrong value would send a donor's money somewhere else. */

const isText = (v) => typeof v === "string" && v.trim() !== "";
const blank = (v) => v === undefined || v === null || v === "";
const isPairs = (v) => Array.isArray(v) && v.every((s) => isText(s?.title) && typeof s.text === "string");
const DONATE_WHERE = { zeffy_url: "zeffy.com", venmo_url: "venmo.com", zelle_url: "enroll.zellepay.com" };

function checkSite(d) {
  if (!isText(d.name)) return '"name" must be the club\'s name.';
  if (!blank(d.email) && !/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(d.email)) return '"email" must be an email address, or empty.';
  if (!blank(d.instagram) && !instagramHandle(d.instagram)) return '"instagram" must be the Instagram user name, without the @, or empty.';
  if (!blank(d.headline) && typeof d.headline !== "string") return '"headline" must be text, one line per row.';
  for (const key of ["facts", "day"]) if (!blank(d[key]) && !isPairs(d[key])) return `"${key}" must be a list, and each item needs a "title" and a "text".`;
  if (!blank(d.volunteer_photos) && !(Array.isArray(d.volunteer_photos) && d.volunteer_photos.every((p) => typeof p === "string" && /^\/photos\/[^/]+$/.test(p)))) return '"volunteer_photos" must be a list of photos on the site, each written as "/photos/<file name>".';
  return "";
}

// Where donations go may only change to something the person typed themselves in this conversation.
// Claude can read web pages, and nothing it read there, or in a file, may be able to move the club's
// money. `said` is what the person has typed and `before` is the file as it is now; with neither (a
// file checked as it stands, as the tests do) there is nothing to compare.
const MONEY = [...Object.keys(DONATE_WHERE), "zelle_to"];
const bare = (value) => String(value).trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
// The whole value, as a word of its own: a longer link the person typed does not vouch for a shorter one inside it.
const typed = (said, value) => new RegExp(`(^|[\\s(<\\["'])(https?://)?(www\\.)?${bare(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/*(?=$|[\\s)>\\]"',;!?]|\\.(\\s|$))`, "i").test(said);
function fromThePerson(d, { said, before } = {}) {
  if (typeof said !== "string") return "";
  let was = {};
  try {
    was = JSON.parse(before) ?? {};
  } catch { /* a new file, or one that cannot be read: everything in it counts as changed */ }
  const moved = MONEY.find((key) => !blank(d[key]) && d[key] !== was[key] && !typed(said, d[key]));
  return moved ? `"${moved}" decides where donations go, so it can only be set to something the person typed in this conversation themselves. If you did not mean to change it, write it back exactly as it is in the file. Otherwise ask them to paste the club's own ${moved === "zelle_to" ? "Zelle email or phone number" : "link"} here, then use it exactly as they typed it.` : "";
}

function checkDonate(d, context) {
  for (const [key, where] of Object.entries(DONATE_WHERE)) {
    if (!blank(d[key]) && !donateUrl(key, d[key])) return `"${key}" must be an https:// address on ${where}, or empty. This is where donations go, so it is checked. If the club really has a new address there, ask the person to confirm it.`;
  }
  if (!blank(d.ways) && !isPairs(d.ways)) return '"ways" must be a list, and each item needs a "title" and a "text".';
  return fromThePerson(d, context);
}

// The surf cams. A camera's feed is loaded into the club's own page, so it is held to exactly what
// its kind takes (render.js, camSource); anything else is refused here before it can be published.
function checkCams(d) {
  if (!blank(d.map_token) && typeof d.map_token !== "string") return '"map_token" must be text, or empty. Kevin sets it; leave it as it is.';
  if (blank(d.cams)) return "";
  if (!Array.isArray(d.cams)) return '"cams" must be a list of cameras.';
  for (const [i, c] of d.cams.entries()) {
    const which = `Camera ${i + 1}${isText(c?.name) ? ` (${c.name})` : ""}`;
    if (!isText(c?.name)) return `${which} needs a "name".`;
    if (!CAM_KIND_NAMES.includes(c.kind)) return `${which}: "kind" must be one of ${CAM_KIND_NAMES.join(", ")}.`;
    if (!blank(c.link) && !webUrl(c.link)) return `${which}: "link" must be a full web address starting with https://, or empty.`;
    if (!blank(c.views) && !(Array.isArray(c.views) && c.kind !== "link" && c.views.every((v) => isText(v?.name) && camSource(c.kind, v.source)))) return `${which}: "views" must be a list, and each view needs a "name" (the words on its button) and a "source" that is what a "${c.kind}" camera takes.`;
    if (c.kind === "link" ? !webUrl(c.link) : !(c.views?.length || camSource(c.kind, c.source))) return `${which}: ${c.kind === "link" ? 'a "link" camera needs the address of its own page in "link".' : `"source" is not what a "${c.kind}" camera takes. A new camera feed is a job for Kevin: say so, and add it as kind "link" with the address of its own page meanwhile.`}`;
    if (!blank(c.far) && typeof c.far !== "boolean") return `${which}: "far" must be true or false. True keeps the camera off the page until a visitor widens the stretch of coast.`;
    for (const [key, most] of [["lat", 90], ["lon", 180]]) if (!blank(c[key]) && !(typeof c[key] === "number" && Math.abs(c[key]) <= most)) return `${which}: "${key}" must be a number (a map coordinate), or left out.`;
  }
  return "";
}

// An extra page's body is the one field published as HTML. A web page Claude read could tell it to
// put a script there, and a script on the club's own address can reach the sign-ins the editors
// keep in their browsers. So HTML written here is held to plain formatting: these tags, a link's
// href, a picture's src and alt, and nothing else. Whatever does not match exactly is refused,
// which is what makes a pattern enough. (The editor's own text box is a person typing: not checked here.)
const BODY_TAGS = "p br hr h2 h3 h4 ul ol li strong em b i u s a blockquote img figure figcaption table thead tbody tr th td".split(" ");
const BODY_ATTRS = { a: ["href"], img: ["src", "alt"] };
const bodyLink = (v) => /^([a-z0-9]+(-[a-z0-9]+)*\.html)?(#[\w-]+)?$/.test(v) ? v : /^mailto:[^\s@]+@[^\s@]+$/.test(v) ? v : webUrl(v);
function checkBody(html) {
  if (typeof html !== "string") return '"body" must be text: simple HTML.';
  for (const [tag] of html.matchAll(/<[^>]*>?/g)) {
    const no = (why) => `"body" cannot hold ${tag.slice(0, 60)} because ${why}. Only simple HTML goes there: ${BODY_TAGS.join(", ")}. A link takes only href, a picture takes only src and alt, and nothing else takes anything.`;
    const [, closing, name, attrs] = /^<(\/?)([a-z][a-z0-9]*)((?:\s+[a-z]+="[^"<>]*")*)\s*\/?>$/.exec(tag) ?? [];
    if (!name) return no("it is not a plain tag (a bare < in the words is written &lt;)");
    if (!BODY_TAGS.includes(name)) return no("that tag is not allowed");
    for (const [, key, value] of attrs.matchAll(/\s+([a-z]+)="([^"<>]*)"/g)) {
      if (closing || !BODY_ATTRS[name]?.includes(key)) return no(`"${key}" is not allowed there`);
      if (key === "href" && !bodyLink(value)) return no("a link goes to a page of this site, a full https:// address or a mailto: address");
      if (key === "src" && !/^\/photos\/[^/]+$/.test(value)) return no('a picture must be a photo on the site, written "/photos/<file name>"');
    }
  }
  return "";
}

function checkEntry(folder, d) {
  if (!isText(d.title)) return folder === "team" ? 'A team member needs a "title": their name.' : 'This needs a "title".';
  if (folder === "team" && !blank(d.order) && !(typeof d.order === "number" && Number.isFinite(d.order) && d.order >= 0)) return '"order" must be a number, 0 or more. Lower shows first.';
  if (folder === "team" && !blank(d.group) && !["board", "volunteers"].includes(d.group)) return '"group" must be "board" or "volunteers".';
  if (folder === "team" && !blank(d.link) && !personLink(d.link)) return '"link" must be a page of this site, like "cams.html", or a full web address starting with https://, or empty.';
  if (folder === "pages" && !blank(d.body) && checkBody(d.body)) return checkBody(d.body);
  if (folder === "press") {
    if (!blank(d.url) && !webUrl(d.url)) return '"url" must be a full web address starting with https://, or empty.';
    if (!blank(d.date) && !/^\d{4}(-\d{2}-\d{2})?$/.test(d.date)) return '"date" must look like 2026-10-01, or just the year.';
    if (!blank(d.kind) && !["Article", "Film"].includes(d.kind)) return '"kind" must be "Article" or "Film".';
    if (!blank(d.cover) && !(typeof d.cover === "string" && (/^\/photos\/[^/]+$/.test(d.cover) || (d.cover.startsWith("https://") && webUrl(d.cover))))) return '"cover" must be a photo on the site ("/photos/name") or a full https:// picture address, or empty.';
  }
  return "";
}

/* ---- the grey words in an empty conversation: the next thing the site still needs, worked out from
   the published content, so the suggestion moves on by itself once that thing has been done. */

const ANYTHING = "Or say anything else you want changed, or point at something on the page and say what should happen to it.";
const listed = (names) => (names.length < 2 ? names.join("") : names.slice(0, -1).join(", ") + " and " + names.at(-1));

export function hint(files) {
  const team = [];
  for (const [path, text] of files) {
    if (!path.startsWith("content/team/")) continue;
    try {
      const person = JSON.parse(text);
      if (isText(person?.title)) team.push(person);
    } catch { /* a file that cannot be read is not counted */ }
  }
  // ponytail: "the board has been given" means more people under Board and leadership than the three
  // found in public records when the site was made. If the real board is three people, lower the 4.
  if (team.filter((p) => p.group === "board").length < 4) return `You can do things like: paste the names and titles of the club's board members, and I will add them all to the team page and then help with their photos. ${ANYTHING}`;
  const few = (names) => (names.length > 4 ? names.slice(0, 4).join(", ") + " and the others who have none" : listed(names));
  const bare = team.filter((p) => !isText(p.photo)).map((p) => p.title);
  if (bare.length) return `You can do things like: drag photos of ${few(bare)} onto this chat and say who is who. ${ANYTHING}`;
  // The cards sit side by side, so a few words about some people and none about the others looks
  // uneven. Nobody having any is fine; otherwise ask for everyone still missing, at once.
  const quiet = team.filter((p) => !isText(p.bio)).map((p) => p.title);
  if (quiet.length && quiet.length < team.length) return `You can do things like: tell me a sentence or two about ${few(quiet)}, so everyone on the team page has a few words. ${ANYTHING}`;
  return `You can do things like: “Add a new person to the team page.” ${ANYTHING}`;
}

export default {
  id: "salinas-surf-club",              // the name the chat server knows this site by
  name: "Salinas Surf Club",
  icon: "logo.png",
  repo: "Architeuthis-Flux/SalinasSurfClub",
  branch: "main",
  chat: "https://crabbe-construction-chat.kevinc-af9.workers.dev",     // shared with Kevin's other friends' sites
  auth: "https://crabbe-construction-auth.kevinc-af9.workers.dev",
  hint,                                 // a suggestion that follows what the site still needs (above)

  // What Claude may touch.
  design: "content/design.css",         // design overrides, published as design.css after site.css
  readOnly: "site.css",                 // the main stylesheet: Claude may read it, never change it
  photos: "photos/",                    // where photos live in the repo
  pathHelp: "content/site.json, content/about.json, content/donate.json, content/contact.json, content/cams.json, content/team/<slug>.json, content/press/<slug>.json, content/pages/<slug>.json",
  isContent: (path) => SINGLE.has(path) || path === FEED || ENTRY.test(path),
  checkPath(path, { reading, deleting }) {
    if (path === FEED) return reading ? "" : "The Instagram posts are filled in from Instagram by themselves, once a day. They cannot be changed here.";
    if (SINGLE.has(path)) return deleting ? "That page is part of the site and cannot be deleted." : "";
    if (folderOf(path) === "pages" && RESERVED.has(slugOf(path))) return `The name "${slugOf(path)}" is used by the site itself. Pick another.`;
    return "";
  },
  checkContent(path, data, context) {
    if (path === "content/site.json") return checkSite(data);
    if (path === "content/donate.json") return checkDonate(data, context);
    if (path === "content/cams.json") return checkCams(data);
    if (ENTRY.test(path)) return checkEntry(folderOf(path), data);
    return "";
  },
  label: (path, title) => SINGLE.get(path)?.[0] ?? (path === FEED ? "Instagram posts" : `${KINDS[folderOf(path)]}: ${title || slugOf(path)}`),

  // The preview: built in the browser by the same render.js that publishes the site.
  home: "index.html",
  pageFor: (path) => SINGLE.get(path)?.[1] ?? (path === FEED ? "index.html" : folderOf(path) === "pages" ? slugOf(path) + ".html" : folderOf(path) + ".html"),
  pageTitle: (name) => PAGE_TITLES[name] ?? name.replace(/\.html$/, "").replaceAll("-", " "),
  pageOfLink: (path, current) => (path === "./" ? "index.html" : path === "" ? current : path),
  preview: ({ files, hasPhoto, photoUrl }) => buildSite({ files, hasPhoto, photoUrl, version: "preview", preview: true }).pages,
};
