// What is particular to this site in the Ask Claude panel. The panel itself (ask.html, ask.js)
// is the same on every site and comes from the friend-sites kit; do not edit those here.
// Checked by ask.site.test.mjs (npm test).

import { buildSite, donateUrl, instagramHandle, webUrl, RESERVED } from "./render.js";

// One file per fixed page: path -> [what the "Ready to publish" list calls it, the preview page that shows it].
const SINGLE = new Map([
  ["content/site.json", ["Home page and site details", "index.html"]],
  ["content/about.json", ["About page", "about.html"]],
  ["content/donate.json", ["Donate page", "donate.html"]],
  ["content/contact.json", ["Contact page", "contact.html"]],
]);
const FEED = "content/instagram.json";                 // filled in by the daily Instagram job: readable, never writable here
const ENTRY = /^content\/(team|press|pages)\/[a-z0-9]+(-[a-z0-9]+)*\.json$/;
const KINDS = { team: "Team", press: "Press", pages: "Page" };
const folderOf = (path) => path.split("/")[1];
const slugOf = (path) => path.split("/").pop().replace(/\.json$/, "");
const PAGE_TITLES = { "index.html": "Home page", "about.html": "About", "team.html": "Team", "press.html": "Press", "donate.html": "Donate", "contact.html": "Contact" };

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
  return "";
}

function checkDonate(d) {
  for (const [key, where] of Object.entries(DONATE_WHERE)) {
    if (!blank(d[key]) && !donateUrl(key, d[key])) return `"${key}" must be an https:// address on ${where}, or empty. This is where donations go, so it is checked. If the club really has a new address there, ask the person to confirm it.`;
  }
  if (!blank(d.ways) && !isPairs(d.ways)) return '"ways" must be a list, and each item needs a "title" and a "text".';
  return "";
}

function checkEntry(folder, d) {
  if (!isText(d.title)) return folder === "team" ? 'A team member needs a "title": their name.' : 'This needs a "title".';
  if (folder === "team" && !blank(d.order) && !(typeof d.order === "number" && Number.isFinite(d.order) && d.order >= 0)) return '"order" must be a number, 0 or more. Lower shows first.';
  if (folder === "press") {
    if (!blank(d.url) && !webUrl(d.url)) return '"url" must be a full web address starting with https://, or empty.';
    if (!blank(d.date) && !/^\d{4}(-\d{2}-\d{2})?$/.test(d.date)) return '"date" must look like 2026-10-01, or just the year.';
    if (!blank(d.kind) && !["Article", "Film"].includes(d.kind)) return '"kind" must be "Article" or "Film".';
  }
  return "";
}

export default {
  id: "salinas-surf-club",              // the name the chat server knows this site by
  name: "Salinas Surf Club",
  icon: "logo.png",
  repo: "Architeuthis-Flux/SalinasSurfClub",
  branch: "main",
  chat: "https://crabbe-construction-chat.kevinc-af9.workers.dev",     // shared with Kevin's other friends' sites
  auth: "https://crabbe-construction-auth.kevinc-af9.workers.dev",
  hint: "Say what you want changed. For example: “Add a new person to the team page.” Or point at something on the page and say what should happen to it.",

  // What Claude may touch.
  design: "content/design.css",         // design overrides, published as design.css after site.css
  readOnly: "site.css",                 // the main stylesheet: Claude may read it, never change it
  photos: "photos/",                    // where photos live in the repo
  pathHelp: "content/site.json, content/about.json, content/donate.json, content/contact.json, content/team/<slug>.json, content/press/<slug>.json, content/pages/<slug>.json",
  isContent: (path) => SINGLE.has(path) || path === FEED || ENTRY.test(path),
  checkPath(path, { reading, deleting }) {
    if (path === FEED) return reading ? "" : "The Instagram posts are filled in from Instagram by themselves, once a day. They cannot be changed here.";
    if (SINGLE.has(path)) return deleting ? "That page is part of the site and cannot be deleted." : "";
    if (folderOf(path) === "pages" && RESERVED.has(slugOf(path))) return `The name "${slugOf(path)}" is used by the site itself. Pick another.`;
    return "";
  },
  checkContent(path, data) {
    if (path === "content/site.json") return checkSite(data);
    if (path === "content/donate.json") return checkDonate(data);
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
