// The surf cams page (cams.html). The page itself comes from render.js and already works without
// this file: the stills show and every link opens. This starts each screen when it scrolls into
// view, keeps the stills fresh, runs the two sliders that choose the stretch of coast, and puts the
// cameras on an Apple map when the page has a map token.
//
// What may be loaded is decided in render.js (camSource): by the time a value is here it is a video
// id, a player id, a webcam number, or an address on a host the club allows.

const page = document.querySelector(".cams");
const tiles = [...document.querySelectorAll(".cam[data-kind]")];
const numberOf = (tile) => +tile.id.replace("cam-", "");
const fresh = (src) => src + (src.includes("?") ? "&" : "?") + "t=" + Date.now();   // a live file must never come from the browser's cache

// A frame goes on top of a note. If the owner's service lets this site show the camera, the frame
// covers the note. If it refuses (HDOnTap, until the owner has the club's address added), the frame
// stays clear and the note shows through. The frame may run scripts and open links in a new tab but
// may not send the whole page somewhere else (no "allow-top-navigation").
function frame(screen, src) {
  const f = document.createElement("iframe");
  f.sandbox = "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms";
  Object.assign(f, { src, allow: "autoplay; fullscreen", title: "Live camera" });
  const note = Object.assign(document.createElement("p"), { className: "quiet", textContent: "Nothing here? The camera's owner has not let this site show it yet. Use its own page, below." });
  screen.replaceChildren(note, f);
}

const START = {
  youtube: (screen, id) => frame(screen, `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1`),
  windy: (screen, id) => frame(screen, `https://webcams.windy.com/webcams/public/embed/player/${id}/day`),
  frame,   // the owner's own embed player, on a service that lets other sites show it
  // Moving pictures straight from the camera, as a picture that keeps replacing itself. Every viewer is
  // a stream the camera's owner pays for, so the address asks for a small one (see content/cams.json)
  // and it only runs while it is on screen (STREAMS, below).
  mjpeg(screen, src) {
    const link = screen.firstElementChild;
    const img = Object.assign(document.createElement("img"), { src, alt: "Live picture" });
    img.addEventListener("error", () => img.isConnected && screen.replaceChildren(link));   // the camera is down: back to the link (not when idle() below cut it off)
    screen.replaceChildren(img);
  },
  // The Pebble Beach cameras come as their owner's player, which is a script. It runs in a frame that
  // is shut off from this site (sandbox, no "allow-same-origin"), because the editor and Ask Claude keep
  // their sign-in in this site's browser storage and no outside script should be able to read it.
  // A frame like that has no address and no storage of its own. The player writes its addresses as
  // "//host/path", which only work from a real address: hence the <base>, and its settings are given
  // "https:" on the way in, because it reads them again inside a worker that the <base> does not reach.
  // It is handed an empty storage in case it asks for one.
  // ponytail: this leans on how HDRelay's player works today. If these screens ever sit on a spinner,
  // make the camera kind "image" with its snapshot address, or "link", in content/cams.json.
  hdrelay(screen, id) {
    const f = document.createElement("iframe");
    f.sandbox = "allow-scripts";
    f.srcdoc = `<!doctype html><base href="https://manage.hdrelay.com/"><style>html,body{margin:0;height:100%;overflow:hidden;background:#052a33}</style><div id="p"></div>
<script>Object.defineProperty(window, "localStorage", { value: { getItem: () => null, setItem() {}, removeItem() {} } });
const get = fetch; fetch = (url, how) => get(url, how).then(async (r) => (String(url).includes("manage.hdrelay.com/player/") ? new Response((await r.text()).replaceAll('"//', '"https://'), { headers: { "content-type": "application/json" } }) : r));</script>
<script src="https://manage.hdrelay.com/js/hdrelay.js"></script><script>HDRelay.create({ target: "p", id: ${JSON.stringify(id)} })</script>`;
    Object.assign(f, { allow: "autoplay; fullscreen", title: "Live camera" });
    screen.replaceChildren(f);
  },
  // ponytail: the browser's own HLS player (Safari, Chrome, Edge). Firefox has none, so it keeps the
  // link to the camera's own page; add hls.js here if Firefox visitors turn out to matter.
  hls(screen, src) {
    const v = document.createElement("video");
    if (!v.canPlayType("application/vnd.apple.mpegurl")) return;
    const link = screen.firstElementChild;
    v.addEventListener("error", () => screen.replaceChildren(link));   // the stream is down: back to the link to its own page
    Object.assign(v, { src: fresh(src), muted: true, playsInline: true, controls: true });
    screen.replaceChildren(v);
  },
};
const STREAMS = new Set(["mjpeg"]);   // kinds that cost their owner something every second: these stop the moment they are off screen

// A screen starts the first time it is seen, and can be put back the way the page was written.
function start(tile) {
  if (tile.dataset.on || tile.hidden) return;
  const screen = tile.querySelector(".screen");
  tile.idle = screen.innerHTML;
  tile.dataset.on = "1";
  START[tile.dataset.kind]?.(screen, tile.dataset.source);
}
function idle(tile) {
  if (!tile.dataset.on) return;
  delete tile.dataset.on;
  if (tile.dataset.kind === "image") return;
  const screen = tile.querySelector(".screen"), stream = STREAMS.has(tile.dataset.kind) && screen.querySelector("img");
  screen.innerHTML = tile.idle;
  if (stream) stream.src = "";   // taking the picture off the page does not hang up on the camera; this does
}

const seen = new IntersectionObserver((entries) => {
  for (const { target: tile, isIntersecting } of entries) {
    tile.toggleAttribute("data-visible", isIntersecting);
    if (isIntersecting) start(tile);
    else if (STREAMS.has(tile.dataset.kind)) idle(tile);
    const video = tile.querySelector("video");   // video stops while it is off screen and picks up again
    if (video) isIntersecting ? video.play().catch(() => {}) : video.pause();
  }
}, { threshold: 0.25 });
for (const tile of tiles) seen.observe(tile);
document.addEventListener("visibilitychange", () => {   // nobody is looking at a tab in the background
  for (const tile of tiles) if (STREAMS.has(tile.dataset.kind)) document.hidden ? idle(tile) : tile.hasAttribute("data-visible") && start(tile);
});

// Stills: ask for the picture again every minute while it is on screen. The owners replace the file
// (Nepenthe about once a minute, the USGS beach cameras every half hour in daylight).
setInterval(() => {
  if (document.hidden) return;
  for (const img of document.querySelectorAll('.cam[data-kind="image"][data-visible] img')) img.src = fresh(img.closest(".cam").dataset.source);
}, 60_000);

/* ---- the stretch of coast: From and To, each a camera's number, north (1) to south. The wall shows
   the cameras between them. With To north of From it shows the same cameras south to north. A camera
   outside the stretch is hidden and its feed is stopped. */

const range = document.querySelector(".cam-range");
let pins = [];   // the Apple map's pins, once there is one

// The coast, drawn: north up, 1000 units to a degree of latitude, measured from 37.01 N 122.09 W.
// The outline is OpenStreetMap's coastline, thinned to a few hundred points. Down the sea side runs
// a column of the cameras' numbers, evenly spaced in the page's order, each tied by a line to its
// spot on the shore: around Monterey and Pebble Beach the spots are too close to number in place.
const COAST = "M-89 -3 -82 2 -80 6 -76 6 -77 9 -74 10 -75 12 -66 15 -63 19 -64 22 -58 22 -52 29 -51 34 -46 32 -41 35 -36 43 -33 43 -29 46 -26 44 -24 48 -20 47 -13 54 1 56 6 58 9 57 11 57 11 60 19 62 25 60 35 61 40 57 51 60 53 54 52 50 59 47 65 47 71 50 71 47 78 51 82 50 91 56 94 55 102 49 109 39 112 39 122 32 135 35 147 42 164 56 182 78 225 161 227 160 225 159 226 157 224 151 219 145 218 139 219 145 224 151 226 157 232 152 230 141 241 128 231 141 233 152 227 158 226 162 240 197 241 202 240 203 243 201 241 197 243 193 239 192 239 188 243 192 243 189 245 189 243 193 244 200 249 197 256 196 259 193 261 192 264 196 272 194 273 193 271 192 273 193 276 191 277 183 280 178 279 175 276 176 276 178 277 175 275 174 278 176 279 172 271 168 265 160 265 153 268 152 271 155 275 151 271 155 269 153 268 155 268 153 265 154 265 160 271 168 277 169 282 175 277 194 279 202 282 204 278 202 276 195 270 197 270 205 271 199 267 198 270 199 270 197 263 198 259 195 257 198 245 201 246 210 245 208 243 210 238 225 240 233 238 225 244 205 243 203 244 202 241 204 242 208 238 215 228 258 225 313 214 351 196 384 187 396 179 403 171 408 163 409 158 407 157 402 161 402 155 400 149 388 145 389 141 387 139 385 140 383 135 382 133 375 128 373 123 373 121 376 122 383 120 383 118 394 112 401 105 401 100 425 98 427 93 427 92 430 90 428 89 430 94 435 96 440 100 441 110 449 112 443 116 445 118 444 121 446 120 449 124 448 128 456 129 463 125 467 126 471 129 473 132 485 130 487 122 487 123 489 121 491 120 490 120 488 117 489 114 486 113 489 109 486 110 488 109 487 109 489 112 490 109 491 119 498 118 501 120 502 119 503 121 503 122 505 120 510 123 512 119 517 117 517 115 520 117 519 117 522 118 520 119 521 120 527 122 531 123 538 129 544 132 550 132 556 128 557 129 563 131 562 134 569 133 570 134 569 137 574 137 580 141 584 138 593 141 598 139 599 143 604 141 607 142 610 144 609 148 612 148 615 150 617 148 619 151 624 150 625 151 628 148 636 146 636 147 638 150 639 151 646 147 653 158 669 155 682 157 685 156 694 153 703 150 703 150 704 153 707 155 705 164 708 171 720 179 724 182 729 185 730 186 727 185 729 191 732 201 750 204 758 202 761 209 763 211 768 217 769 224 777 232 775 240 778 243 782 248 782 252 786 256 787 270 799 276 800 282 806 299 814 301 820 304 819 307 825 312 829 314 835";
const TOWNS = [["Santa Cruz", 36.985, -122.03], ["Moss Landing", 36.804, -121.778], ["Marina", 36.684, -121.79], ["Monterey", 36.592, -121.885], ["Carmel", 36.552, -121.915], ["Big Sur", 36.27, -121.8]];
const spot = (lat, lon) => [Math.round((+lon + 122.09) * 802.8), Math.round((37.01 - lat) * 1000)];
const row = (n) => Math.round(40 + ((n - 1) * 740) / Math.max(tiles.length - 1, 1));
const safe = (text) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
function drawCoast(box) {
  const marks = tiles.map((tile) => {
    const n = numberOf(tile), y = row(n), c = `style="--c:${tile.style.getPropertyValue("--c")}"`;
    const [x, at] = tile.dataset.lat ? spot(tile.dataset.lat, tile.dataset.lon) : [];
    return `<g data-n="${n}" ${c}><title>${safe(tile.querySelector(".plate span").textContent)}</title>
${tile.dataset.lat ? `<path d="M-96 ${y}L${x} ${at}"/><circle cx="${x}" cy="${at}" r="7"/>` : ""}<rect x="-146" y="${y - 14}" width="50" height="28"/><text x="-121" y="${y + 7}">${String(n).padStart(2, "0")}</text></g>`;
  });
  box.innerHTML = `<svg viewBox="-156 0 560 820" role="img" aria-label="Map of the coast from Santa Cruz to Big Sur with each camera marked">
<path class="land" d="${COAST}L460 900 460 -80Z"/>${TOWNS.map(([name, lat, lon]) => `<text class="town" x="${spot(lat, lon)[0]}" y="${spot(lat, lon)[1]}">${name}</text>`).join("")}
<path class="span" d=""/>${marks.join("")}</svg>`;
  box.addEventListener("click", (event) => {   // a mark on the map: bring that camera into the stretch if it is outside, and go to it
    const n = +event.target.closest("[data-n]")?.dataset.n;
    if (!n) return;
    const [lo, hi] = [+range.from.value, +range.to.value].sort((a, b) => a - b);
    if (n < lo || n > hi) { (Math.abs(n - +range.from.value) < Math.abs(n - +range.to.value) ? range.from : range.to).value = n; stretch(); }
    tiles[n - 1].scrollIntoView({ behavior: "smooth", block: "center" });
  });
}
function stretch() {
  const from = +range.from.value, to = +range.to.value, lo = Math.min(from, to), hi = Math.max(from, to), back = from > to;
  for (const tile of tiles) {
    const n = numberOf(tile), out = n < lo || n > hi;
    if (out) idle(tile);
    tile.hidden = out;
    tile.style.order = back ? -n : "";
  }
  for (const input of [range.from, range.to]) {
    const tile = tiles[+input.value - 1];
    input.nextElementSibling.value = `${tile.querySelector(".plate").textContent.replace(/^(\d+)/, "$1 ")} · ${tile.querySelector(".bar-note").textContent}`;
  }
  range.querySelector(".bar-note").textContent = `${hi - lo + 1} of ${tiles.length} cameras, ${back ? "south to north" : "north to south"}`;
  for (const mark of range.querySelectorAll("[data-n]")) mark.classList.toggle("out", +mark.dataset.n < lo || +mark.dataset.n > hi);
  range.querySelector(".span")?.setAttribute("d", `M-151 ${row(lo) - 14}V${row(hi) + 14}`);
  for (const pin of pins) pin.visible = !document.getElementById(pin.data.id).hidden;
  for (const tile of tiles) if (!tile.hidden && tile.hasAttribute("data-visible")) start(tile);   // one that was on screen all along
}
if (range && tiles.length > 1) {
  range.hidden = false;
  drawCoast(range.querySelector(".coast"));
  range.addEventListener("input", stretch);
  range.addEventListener("submit", (event) => event.preventDefault());
  stretch();
}

/* ---- the map: Apple's MapKit JS, only when content/cams.json has a map token. A pin carries its
   camera's number; picking one scrolls to that camera. If Apple's script does not load, or the token
   is refused, the map panel simply stays hidden. */

const pinned = tiles.filter((tile) => tile.dataset.lat);
if (page?.dataset.mapToken && pinned.length) {
  window.camsMap = (error) => {
    if (error || !window.mapkit) return;
    const panel = document.getElementById("cam-map");
    panel.hidden = false;
    page.classList.add("has-map");
    const { mapkit } = window;
    mapkit.addEventListener("error", () => { panel.hidden = true; page.classList.remove("has-map"); });   // Apple refused the token
    const map = new mapkit.Map(panel.querySelector(".map"), { colorScheme: mapkit.ColorScheme.Dark, showsMapTypeControl: false, showsPointsOfInterest: false });
    pins = pinned.map((el) => new mapkit.MarkerAnnotation(new mapkit.Coordinate(+el.dataset.lat, +el.dataset.lon), {
      title: el.querySelector(".plate span").textContent,
      glyphText: String(numberOf(el)),
      color: getComputedStyle(el).getPropertyValue("--c").trim() || "#a4e435",
      glyphColor: "#052a33",
      visible: !el.hidden,
      data: { id: el.id },
    }));
    map.showItems(pins, { padding: new mapkit.Padding(40, 30, 30, 30) });
    map.addEventListener("select", (event) => {
      const el = document.getElementById(event.annotation?.data?.id);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("picked");
      void el.offsetWidth;            // so picking the same pin twice lights it twice
      el.classList.add("picked");
    });
  };
  const s = document.createElement("script");
  s.src = "https://cdn.apple-mapkit.com/mk/6/mapkit.core.js";
  s.crossOrigin = "anonymous";
  s.async = true;
  Object.assign(s.dataset, { callback: "camsMap", libraries: "full-map", token: page.dataset.mapToken });
  document.head.append(s);
}
