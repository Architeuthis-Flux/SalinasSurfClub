#!/usr/bin/env node
// Keeps the Instagram posts on the home page up to date.
//
//   node scripts/sync-feed.mjs          fetch the feed, save new posts
//   node scripts/sync-feed.mjs --test   self-check
//
// The feed comes from Behold (behold.so), which the club's Instagram account is connected to. Its
// address is the BEHOLD_FEED_URL secret. Behold's free plan only returns the latest few posts and
// Instagram's own picture addresses expire, so this runs before every build and:
//   1. fetches the feed,
//   2. saves the picture of each post it has not seen as photos/ig-<post id>.jpg,
//   3. adds those posts to content/instagram.json, newest first, keeping the latest MAX_POSTS.
// The workflow commits what changed, so the grid never depends on an address that expires.
// No secret, a failed fetch, a strange answer: all of them mean "keep what we have". This must
// never be the reason a deploy fails.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(ROOT, "content", "instagram.json");
const PHOTOS = join(ROOT, "photos");
const MAX_POSTS = 24;
const MAX_BYTES = 5_000_000;

const shortcodeOf = (permalink) => /^https:\/\/www\.instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)\/?$/.exec(String(permalink ?? ""))?.[1] ?? null;
const httpsUrl = (value) => {
  try {
    return new URL(String(value)).protocol === "https:" ? String(value) : null;
  } catch {
    return null;
  }
};

// Works out what the archive should hold after seeing a feed. Pure: no files, no network.
// Returns the new list (newest first) and the pictures still to fetch: [{ shortcode, url }].
// A post is only kept once its picture is saved, so `saved` says which fetches worked.
export function merge(archive, feedPosts, saved = () => true) {
  const posts = [...archive];
  const wanted = [];
  let at = -1;                                           // where the previous feed post sits, so new ones land in order
  for (const post of Array.isArray(feedPosts) ? feedPosts : []) {
    const shortcode = shortcodeOf(post?.permalink);
    if (!shortcode) continue;
    const existing = posts.findIndex((p) => p.shortcode === shortcode);
    if (existing !== -1) {
      at = existing;
      continue;
    }
    const url = httpsUrl(post.sizes?.medium?.mediaUrl) ?? httpsUrl(post.thumbnailUrl) ?? httpsUrl(post.mediaUrl);
    if (!url) continue;
    wanted.push({ shortcode, url });
    if (!saved(shortcode)) continue;
    posts.splice(at + 1, 0, {
      shortcode,
      permalink: `https://www.instagram.com/p/${shortcode}/`,
      caption: String(post.prunedCaption ?? post.caption ?? "").slice(0, 2200),
      mediaType: String(post.mediaType ?? "IMAGE"),
      timestamp: String(post.timestamp ?? ""),
      image: `/photos/ig-${shortcode}.jpg`,
    });
    at += 1;
  }
  return { posts: posts.slice(0, MAX_POSTS), wanted };
}

function selftest() {
  const old = [{ shortcode: "B", permalink: "https://www.instagram.com/p/B/", image: "/photos/ig-B.jpg" }];
  const feed = [
    { permalink: "https://www.instagram.com/p/A_1-x/", thumbnailUrl: "https://cdn.example/a.jpg", caption: "newest" },
    { permalink: "https://www.instagram.com/reel/B/", mediaUrl: "https://cdn.example/b.jpg" },
    { permalink: "https://www.instagram.com/p/C/", sizes: { medium: { mediaUrl: "https://cdn.example/c.jpg" } } },
    { permalink: "https://evil.example/p/D/", mediaUrl: "https://cdn.example/d.jpg" },      // not Instagram
    { permalink: "https://www.instagram.com/p/E/", mediaUrl: "http://cdn.example/e.jpg" },   // not https
    { permalink: "https://www.instagram.com/p/../x/", mediaUrl: "https://cdn.example/f.jpg" },
    null,
  ];
  const made = merge(old, feed);
  assert.deepEqual(made.posts.map((p) => p.shortcode), ["A_1-x", "B", "C"]);                // in feed order, around what was there
  assert.deepEqual(made.wanted.map((w) => w.shortcode), ["A_1-x", "C"]);
  assert.equal(made.posts[0].image, "/photos/ig-A_1-x.jpg");
  assert.deepEqual(merge(old, feed, (code) => code !== "C").posts.map((p) => p.shortcode), ["A_1-x", "B"]);   // a picture that failed
  assert.deepEqual(merge(old, "nonsense").posts, old);
  assert.equal(merge([], Array.from({ length: 40 }, (_, i) => ({ permalink: `https://www.instagram.com/p/n${i}/`, mediaUrl: "https://c.example/x.jpg" }))).posts.length, MAX_POSTS);
  console.log("ok (Instagram sync)");
}

async function main() {
  const feedUrl = httpsUrl(process.env.BEHOLD_FEED_URL);
  if (!feedUrl) return console.warn("sync-feed: BEHOLD_FEED_URL is not set, keeping the posts we have");
  const archive = JSON.parse(readFileSync(ARCHIVE, "utf8"));
  const res = await fetch(feedUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`the feed answered ${res.status}`);
  const feed = await res.json();
  const before = Array.isArray(archive.posts) ? archive.posts : [];

  // Fetch the pictures of posts we have not seen. One that fails is left for the next run.
  const got = new Set();
  for (const { shortcode, url } of merge(before, feed.posts).wanted) {
    try {
      const img = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      const bytes = Buffer.from(await img.arrayBuffer());
      if (!img.ok || !String(img.headers.get("content-type")).startsWith("image/") || bytes.length > MAX_BYTES) throw new Error(`not a usable picture (${img.status})`);
      mkdirSync(PHOTOS, { recursive: true });
      writeFileSync(join(PHOTOS, `ig-${shortcode}.jpg`), bytes);
      got.add(shortcode);
    } catch (e) {
      console.warn(`sync-feed: skipping ${shortcode}: ${e.message}`);
    }
  }
  const { posts } = merge(before, feed.posts, (code) => got.has(code) || existsSync(join(PHOTOS, `ig-${code}.jpg`)));
  writeFileSync(ARCHIVE, JSON.stringify({ ...archive, posts }, null, 2) + "\n");
  console.log(`sync-feed: ${got.size} new post(s), ${posts.length} kept`);
}

if (process.argv[2] === "--test") selftest();
else main().catch((e) => console.warn(`sync-feed: ${e.message}, keeping the posts we have`));
