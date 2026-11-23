// Builds every page of the Salinas Surf Club site from its content files.
//
// One renderer, two callers: build.js runs it in Node to publish the site, and the Ask Claude
// page runs it in the browser to show changes before they are published. It only turns text into
// text: no files, no network, nothing that differs between the two.

export const RESERVED = new Set(["index", "about", "team", "press", "donate", "contact", "guide", "ask"]);   // page names the site itself uses

/* ------------------------------------------------------------------ small helpers */

export function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

export function paras(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");
}

// HTML from a rich text box. Pictures dropped into the text are stored as "/photos/x.webp"; make
// them relative like every other link, so they load when the site is not at the root of its domain.
export function rich(body) {
  return String(body).replaceAll('="/photos/', '="photos/');
}

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function num(value) {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : 0;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-10-01" -> "October 1, 2026". Anything else (a bare year, say) is shown as it was typed.
// Done by hand so the same date reads the same on every machine, whatever its time zone.
export function longDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!m || +m[2] < 1 || +m[2] > 12) return String(value ?? "");
  return `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
}

// A link someone typed, if it is an ordinary web address. Anything else ("javascript:", a bare
// word) comes back empty, and the page leaves the link out.
export function webUrl(value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

// The donation links are where money goes, so each must be an https address on the service it is
// named for. Used here (a wrong link is never shown) and by ask.site.js (a wrong link is refused).
export const DONATE_HOSTS = {
  zeffy_url: ["www.zeffy.com", "zeffy.com"],
  venmo_url: ["www.venmo.com", "venmo.com", "account.venmo.com"],
  zelle_url: ["enroll.zellepay.com"],
};

export function donateUrl(key, value) {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" && !url.username && !url.password && DONATE_HOSTS[key]?.includes(url.hostname) ? url.href : "";
  } catch {
    return "";
  }
}

// The address Zeffy serves a donation form from when it sits inside another page.
export function zeffyEmbed(value) {
  const url = donateUrl("zeffy_url", value);
  const m = url && /\/donation-form\/([A-Za-z0-9-]+)\/?$/.exec(new URL(url).pathname);
  return m ? `https://www.zeffy.com/embed/donation-form/${m[1]}` : "";
}

export const instagramHandle = (value) => (/^[A-Za-z0-9._]{1,30}$/.test(String(value ?? "")) ? String(value) : "");
const POST = /^https:\/\/www\.instagram\.com\/(?:p|reel|tv)\/[A-Za-z0-9_-]+\/?$/;

const fileName = (path) => String(path).replace(/\/+$/, "").split("/").pop();
const obj = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
const list = (value) => (Array.isArray(value) ? value.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : []);

// The line of swell under the top band of every page. Two layers; the back one drifts (site.css).
const SWELL = `<svg class="swell" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true">
<path class="swell-back" d="M0 46c120-34 240-34 360 0s240 34 360 0 240-34 360 0 240 34 360 0 240-34 360 0 240 34 360 0v44H0z"/>
<path class="swell-front" d="M0 62c90-26 180-26 270 0s180 26 270 0 180-26 270 0 180 26 270 0 180-26 270 0 90 13 90 13v15H0z"/>
</svg>`;

/* ------------------------------------------------------------------ the site

   buildSite({ files, hasPhoto, ... }) -> { pages: Map(file name -> html), team, press, extraPages }

   files     Map of path -> text for content/*.json, content/team/*.json, content/press/*.json, content/pages/*.json
   hasPhoto  (file name) -> true if that photo exists; a photo that is gone is left out, never shown broken
   photoUrl  (file name) -> address to load it from; the preview uses this for photos not yet published
   version   appended to the stylesheet address so a changed file is never served stale
   preview   true in the Ask Claude preview: marks which content field each piece of text came from
   warn      (message) -> void, for entries that had to be skipped
*/
export function buildSite({ files, hasPhoto, photoUrl = (name) => "photos/" + name, version = "", year = new Date().getFullYear(), preview = false, warn = () => {} }) {
  // Stored image path -> address, or "" if the file is gone. The editor stores "/photos/x.webp";
  // keeping only the file name keeps links relative, so the site works at any address.
  const photo = (path) => {
    const name = path ? fileName(path) : "";
    return name && hasPhoto(name) ? photoUrl(name) : "";
  };
  // Preview only: remember where a piece of the page came from, so pointing at it can tell Claude.
  const mark = (path, field) => (preview ? ` data-edit="${esc(path + "#" + field)}"` : "");

  // One page's own file. A file that is missing or will not parse gives an empty page, not a
  // broken site: one bad save must not take everything down.
  const one = (path) => {
    if (!files.has(path)) return {};
    try {
      return obj(JSON.parse(files.get(path)));
    } catch (e) {
      warn(`skipped ${fileName(path)}: ${e.message}`);
      return {};
    }
  };

  // Entries of a collection, one JSON file each.
  const load = (folder) => {
    const out = [];
    const prefix = `content/${folder}/`;
    for (const path of [...files.keys()].filter((p) => p.startsWith(prefix) && p.endsWith(".json") && !p.slice(prefix.length).includes("/")).sort()) {
      let data;
      try {
        data = JSON.parse(files.get(path));
      } catch (e) {
        warn(`skipped ${fileName(path)}: ${e.message}`);
        continue;
      }
      const slug = slugify(fileName(path).replace(/\.json$/, ""));
      if (data && typeof data === "object" && !Array.isArray(data) && data.title && slug) out.push({ ...data, slug, path });
    }
    return out;
  };

  const SITE = "content/site.json", ABOUT = "content/about.json", DONATE = "content/donate.json", CONTACT = "content/contact.json";
  const site = JSON.parse(files.get(SITE));
  const about = one(ABOUT), donate = one(DONATE), contact = one(CONTACT);
  const name = site.name ?? "";
  const handle = instagramHandle(site.instagram);
  const instagram = handle ? `https://www.instagram.com/${handle}/` : "";

  const team = load("team")
    .map((p, i) => ({ p, i }))
    .sort((a, b) => num(a.p.order) - num(b.p.order) || compare(String(a.p.title).toLowerCase(), String(b.p.title).toLowerCase()) || a.i - b.i)
    .map(({ p }) => p);
  const press = load("press").sort((a, b) => compare(String(b.date ?? ""), String(a.date ?? "")) || compare(a.slug, b.slug));   // newest first
  const extraPages = [];
  for (const g of load("pages")) {
    if (RESERVED.has(g.slug)) {
      warn(`page "${g.title}" skipped, its name is used by the site itself (${g.slug})`);
      continue;
    }
    extraPages.push(g);
  }
  const menu = extraPages.filter((g) => ("menu" in g ? g.menu : true)).map((g) => [g.slug + ".html", g.title]);

  // Instagram posts, saved into content/instagram.json by scripts/sync-feed.mjs. It arrives from
  // outside, so each post is checked: a real Instagram address, and a picture that exists.
  const posts = list(one("content/instagram.json").posts)
    .filter((post) => POST.test(String(post.permalink ?? "")) && photo(post.image))
    .slice(0, 8);

  /* ---------------------------------------------------------------- pieces */

  const nonprofit = () => {
    const id = site.tax_id ? ` <span${mark(SITE, "tax_id")}>Tax ID: ${esc(site.tax_id)}</span>` : "";
    return site.nonprofit || id ? `<p class="nonprofit"><span${mark(SITE, "nonprofit")}>${esc(site.nonprofit)}</span>${id}</p>` : "";
  };

  const layout = (title, desc, body, here = "") => {
    const links = [
      ["about.html", "About"],
      ...(team.length ? [["team.html", "Team"]] : []),
      ...(press.length ? [["press.html", "Press"]] : []),
      ...menu,
      ["contact.html", "Contact"],
    ];
    const nav = links.map(([h, t]) => `<a href="${esc(h)}"${h === here ? ' aria-current="page"' : ""}>${esc(t)}</a>`).join("");
    const mail = site.email ? `<a href="mailto:${esc(site.email)}"${mark(SITE, "email")}>${esc(site.email)}</a>` : "";
    const insta = instagram ? `<a href="${instagram}"${mark(SITE, "instagram")}>@${esc(handle)} on Instagram</a>` : "";
    // ponytail: noindex while the site is a draft; delete the robots line when Kevin says it is
    // ready to be found, and add the canonical address and a share picture then.
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="icon" href="logo.png">
<link rel="preload" href="fonts/archivo.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="site.css?v=${version}">
<link rel="stylesheet" href="design.css?v=${version}">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
<a class="brand" href="./"${here === "index.html" ? ' aria-current="page"' : ""}><img src="logo.png" alt="" width="48" height="48"><span${mark(SITE, "name")}>${esc(name)}</span></a>
<nav aria-label="Main">${nav}</nav>
<a class="btn give" href="donate.html"${here === "donate.html" ? ' aria-current="page"' : ""}>Donate</a>
</div></header>
<main id="main">
${body}
</main>
<footer class="foot"><div class="wrap">
<img src="logo.png" alt="" width="88" height="88" loading="lazy">
<div class="foot-text">
<p class="foot-name">${esc(name)}</p>
<p${mark(SITE, "area")}>${esc(site.area)}</p>
<p class="foot-links">${mail}${insta}</p>
</div>
<div class="foot-legal">
${nonprofit()}
<p class="small">&copy; ${year} ${esc(name)}. <a href="admin/">Owner login</a> <a href="guide.html">Editing guide</a></p>
</div>
</div></footer>
</body>
</html>
`;
  };

  // The band at the top of every page but the home page.
  const pageHead = (title, lede, path, ledeField = "intro") => {
    const ledeHtml = lede ? `<p class="lede"${path ? mark(path, ledeField) : ""}>${esc(lede)}</p>` : "";
    return `<header class="page-head"><div class="wrap"><h1${path ? mark(path, "title") : ""}>${esc(title)}</h1>${ledeHtml}</div>${SWELL}</header>`;
  };

  const pairs = (items, path, field, tag = "div") =>
    list(items).map((s, i) => `<${tag}${mark(path, `${field}[${i + 1}]`)}><h3>${esc(s.title)}</h3>${paras(s.text)}</${tag}>`).join("");

  const gallery = (shots, title, path = "") => {
    const shown = (Array.isArray(shots) ? shots : []).filter((s) => photo(s));
    if (!shown.length) return "";
    // ponytail: tiles load the full 1800px photo (lazily); add build-time thumbnails if galleries get slow
    const items = shown
      .map((s, i) => `<a href="${photo(s)}"><img src="${photo(s)}" alt="${esc(title)}, photo ${i + 1}" loading="lazy"${path ? mark(path, "photos") : ""}></a>`)
      .join("");
    return `<div class="gallery">${items}</div>`;
  };

  const feed = () => {
    const tiles = posts
      .map((post) => {
        const caption = String(post.caption ?? "").replace(/\s+/g, " ").trim();
        const alt = caption ? (caption.length > 140 ? caption.slice(0, 139) + "…" : caption) : `Instagram post by ${name}`;
        return `<a href="${esc(post.permalink)}" rel="noopener"><img src="${photo(post.image)}" alt="${esc(alt)}" loading="lazy" width="600" height="600"></a>`;
      })
      .join("");
    if (!tiles && !instagram) return "";
    const follow = instagram ? `<a class="btn" href="${instagram}" rel="noopener">Follow @${esc(handle)}</a>` : "";
    return `<section class="feed"><div class="wrap">
<header class="feed-head"><h2${mark(SITE, "feed_title")}>${esc(site.feed_title)}</h2>${follow}</header>
${tiles ? `<div class="tiles">${tiles}</div>` : ""}
</div></section>`;
  };

  /* ---------------------------------------------------------------- pages */

  const home = () => {
    const lines = String(site.headline ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const hero = photo(site.hero_photo);
    const facts = pairs(site.facts, SITE, "facts");
    const day = pairs(site.day, SITE, "day", "li");
    return `<section class="hero${hero ? " has-photo" : ""}">
${hero ? `<img class="hero-photo" src="${hero}" alt="" fetchpriority="high"${mark(SITE, "hero_photo")}>` : ""}
<div class="wrap">
<div class="hero-text">
<h1${mark(SITE, "headline")}><span class="sr">${esc(name)}: </span>${lines.map((l) => `<span>${esc(l)}</span>`).join(" ")}</h1>
<p class="lede"${mark(SITE, "lede")}>${esc(site.lede)}</p>
<p class="actions"><a class="btn give" href="donate.html">Donate</a><a class="btn" href="about.html">About the club</a></p>
</div>
<img class="badge" src="logo.png" alt="${esc(name)} logo: a roaring panther inside a breaking wave" width="468" height="468">
</div>
${SWELL}
</section>
<section class="mission"><div class="wrap">
<div class="mission-text"><h2${mark(SITE, "mission_title")}>${esc(site.mission_title)}</h2><div${mark(SITE, "mission")}>${paras(site.mission)}</div></div>
${facts ? `<div class="facts">${facts}</div>` : ""}
</div></section>
${day ? `<section class="day"><div class="wrap"><h2${mark(SITE, "day_title")}>${esc(site.day_title)}</h2><ol>${day}</ol></div></section>` : ""}
${feed()}
<section class="give-band"><div class="wrap">
<h2${mark(SITE, "donate_title")}>${esc(site.donate_title)}</h2>
<p${mark(SITE, "donate_text")}>${esc(site.donate_text)}</p>
<a class="btn give" href="donate.html">Donate</a>
</div></section>`;
  };

  const aboutPage = () => {
    const shot = photo(about.photo) ? `<figure class="snap"><img src="${photo(about.photo)}" alt="" loading="lazy"${mark(ABOUT, "photo")}></figure>` : "";
    return `${pageHead(about.title || "About", about.intro, ABOUT)}
<article class="story"><div class="wrap">
<div class="prose"${mark(ABOUT, "body")}>${paras(about.body)}</div>
${shot}
</div></article>
<section class="mission plain"><div class="wrap">
<div class="mission-text"><h2${mark(SITE, "mission_title")}>${esc(site.mission_title)}</h2><div${mark(SITE, "mission")}>${paras(site.mission)}</div></div>
</div></section>`;
  };

  const member = (p) => {
    const shot = photo(p.photo) ? `<img src="${photo(p.photo)}" alt="${esc(p.title)}" loading="lazy"${mark(p.path, "photo")}>` : "";
    const role = p.role ? `<p class="role"${mark(p.path, "role")}>${esc(p.role)}</p>` : "";
    return `<article class="member${shot ? "" : " no-photo"}">
${shot}
<h2${mark(p.path, "title")}>${esc(p.title)}</h2>
${role}
<div class="bio"${mark(p.path, "bio")}>${paras(p.bio)}</div>
</article>`;
  };

  const teamPage = () => `${pageHead("Meet the team", "")}
<section class="team"><div class="wrap">${team.length ? `<div class="members">${team.map(member).join("")}</div>` : `<p class="empty">The team page is on its way.</p>`}</div></section>`;

  const mention = (p) => {
    const url = webUrl(p.url);
    const film = p.kind === "Film";
    const title = url ? `<a href="${esc(url)}" rel="noopener">${esc(p.title)}</a>` : esc(p.title);
    const go = url ? `<a class="btn" href="${esc(url)}" rel="noopener" aria-label="${film ? "Watch" : "Read"}: ${esc(p.title)}">${film ? "Watch the film" : "Read the article"}</a>` : "";
    return `<li class="mention">
<p class="when"><time${/^\d{4}-\d{2}-\d{2}/.test(String(p.date)) ? ` datetime="${esc(String(p.date).slice(0, 10))}"` : ""}${mark(p.path, "date")}>${esc(longDate(p.date))}</time></p>
<div>
<p class="outlet"${mark(p.path, "outlet")}>${esc(p.outlet)}</p>
<h2${mark(p.path, "title")}>${title}</h2>
${p.summary ? `<p${mark(p.path, "summary")}>${esc(p.summary)}</p>` : ""}
${go}
</div>
</li>`;
  };

  const pressPage = () => `${pageHead("Press", "")}
<section class="press"><div class="wrap">${press.length ? `<ul class="mentions">${press.map(mention).join("")}</ul>` : `<p class="empty">Nothing here yet.</p>`}</div></section>`;

  const donatePage = () => {
    const zeffy = donateUrl("zeffy_url", donate.zeffy_url);
    const embed = zeffyEmbed(donate.zeffy_url);
    const venmo = donateUrl("venmo_url", donate.venmo_url);
    const zelle = donateUrl("zelle_url", donate.zelle_url);
    // The form is Zeffy's own page in a frame. The Ask Claude preview cannot run it, so it shows a note there.
    const form = !zeffy
      ? ""
      : preview || !embed
        ? `<div class="form-note">${preview ? "<p>The donation form shows here on the real site.</p>" : ""}<a class="btn give" href="${esc(zeffy)}" rel="noopener"${mark(DONATE, "zeffy_url")}>Donate with Zeffy</a></div>`
        : `<iframe class="zeffy" title="Donation form, powered by Zeffy" src="${esc(embed)}" allow="payment"></iframe>
<p class="form-fallback">If the form does not load, <a href="${esc(zeffy)}" rel="noopener">donate on Zeffy's own page</a>.</p>`;
    const other = [
      venmo ? `<li><a class="btn" href="${esc(venmo)}" rel="noopener"${mark(DONATE, "venmo_url")}>Venmo</a></li>` : "",
      zelle ? `<li><a class="btn" href="${esc(zelle)}" rel="noopener"${mark(DONATE, "zelle_url")}>Zelle</a>${donate.zelle_to ? `<span class="to"${mark(DONATE, "zelle_to")}>or send to ${esc(donate.zelle_to)}</span>` : ""}</li>` : "",
    ].join("");
    const ways = pairs(donate.ways, DONATE, "ways");
    return `${pageHead(donate.title || "Donate", donate.intro, DONATE)}
<section class="donate"><div class="wrap">
<div class="donate-form">
${form}
${donate.receipt_note ? `<p class="receipt"${mark(DONATE, "receipt_note")}>${esc(donate.receipt_note)}</p>` : ""}
</div>
<div class="donate-side">
${other ? `<h2>Other ways to give</h2><ul class="other">${other}</ul>` : ""}
${ways ? `<h2${mark(DONATE, "ways_title")}>${esc(donate.ways_title)}</h2><div class="ways">${ways}</div>` : ""}
${nonprofit()}
</div>
</div></section>`;
  };

  const contactPage = () => {
    const mail = site.email ? `<a class="big" href="mailto:${esc(site.email)}"${mark(SITE, "email")}>${esc(site.email)}</a>` : "";
    const dm = handle ? `<p><a class="btn" href="https://ig.me/m/${handle}" rel="noopener">Message us on Instagram</a></p>` : "";
    return `${pageHead(contact.title || "Contact", contact.intro, CONTACT)}
<section class="contact"><div class="wrap">
${mail}
${dm}
${nonprofit()}
</div></section>`;
  };

  const contentPage = (g) => {
    const body = g.body ? `<div class="prose"${mark(g.path, "body")}>${rich(g.body)}</div>` : "";
    return `${pageHead(g.title, g.intro, g.path)}
<article class="story"><div class="wrap">
${body}
${gallery(g.photos, g.title, g.path)}
</div></article>`;
  };

  /* ---------------------------------------------------------------- every page */

  const desc = String(site.mission ?? "").split(/\n\s*\n/)[0].trim();
  const pages = new Map();
  pages.set("index.html", layout(name, desc, home(), "index.html"));
  pages.set("about.html", layout(`${about.title || "About"} | ${name}`, about.intro || desc, aboutPage(), "about.html"));
  pages.set("team.html", layout(`Meet the team | ${name}`, `The people behind ${name}.`, teamPage(), "team.html"));
  pages.set("press.html", layout(`Press | ${name}`, `${name} in the news.`, pressPage(), "press.html"));
  pages.set("donate.html", layout(`${donate.title || "Donate"} | ${name}`, donate.intro || desc, donatePage(), "donate.html"));
  pages.set("contact.html", layout(`${contact.title || "Contact"} | ${name}`, contact.intro || desc, contactPage(), "contact.html"));
  for (const g of extraPages) {
    pages.set(g.slug + ".html", layout(`${g.title} | ${name}`, g.intro || g.title, contentPage(g), g.slug + ".html"));
  }
  return { pages, team, press, extraPages };
}

// Plain code-unit comparison, so the order is the same on every machine (no locale rules).
function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
