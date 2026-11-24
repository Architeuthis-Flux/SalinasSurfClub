// The wording of the club's donation acknowledgement letter, used by receipt.html.
// It only turns what was typed into text: no files, no network. Checked by receipt.test.mjs (npm test).
//
// The wording is the club's own letter ("Donation Acknowledgement Letter"), word for word. It says
// nothing was given in return for the gift, so it is only right for a plain gift of money.

import { longDate } from "./render.js";

export const CLUB = "Salinas Surf Club";
export const TAX_ID = "33-2185571";

// 250 -> "$250", 1250.5 -> "$1,250.50". Anything that is not an amount above zero gives "".
export function money(value) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return "";
  const cents = Math.round(n * 100);
  const dollars = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return "$" + dollars + (cents % 100 ? "." + String(cents % 100).padStart(2, "0") : "");
}

const clean = (value) => String(value ?? "").trim();
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(clean(value));

// What still has to be filled in before the letter is complete, in words for the person at the form.
export function missing(f) {
  const out = [];
  if (!clean(f.donor)) out.push("the donor's name");
  if (!money(f.amount)) out.push("the amount");
  if (!isDate(f.giftDate)) out.push("the date of the gift");
  if (!isDate(f.date)) out.push("the date of the letter");
  if (!clean(f.signer)) out.push("who is signing");
  return out;
}

// The letter, as its parts (for the page) and as plain text (for an email).
export function letter(f) {
  const donor = clean(f.donor);
  const greeting = clean(f.greeting) || donor.split(/\s+/)[0] || "";
  const address = clean(f.address).split(/\n/).map((line) => line.trim()).filter(Boolean);
  const body = [
    `Thank you for making a ${money(f.amount) || "[donation amount]"} donation on ${isDate(f.giftDate) ? longDate(f.giftDate) : "[date]"} to ${CLUB}. Your generosity supports our mission to empower youth from low-income, diverse backgrounds by fostering water safety, physical activity, and community pride, while providing positive role models and leadership opportunities.`,
    `Your gift helps us continue to do the work of connecting first responders, lifeguards, healthcare workers, and community surfers with at-risk youth in East Salinas, introducing them to the benefits of surfing, nature exploration, and environmental stewardship.`,
    `${CLUB} is a 501(c)(3) public charity with a tax identification number of ${TAX_ID}. Your gift to ${CLUB} is tax deductible as allowed by law. No goods or services were exchanged for this contribution.`,
  ];
  const parts = {
    date: isDate(f.date) ? longDate(f.date) : "",
    donor,
    address,
    salutation: `Dear ${greeting || "[First Name]"},`,
    body,
    thanks: "Thanks, again, for your donation.",
    closing: "With deep gratitude,",
    signer: clean(f.signer),
    title: clean(f.title),
  };
  const text = [
    parts.date,
    "",
    [donor || "Donor Name", ...address].join("\n"),
    "",
    parts.salutation,
    "",
    body.join("\n\n"),
    "",
    parts.thanks,
    parts.closing,
    parts.signer,
    parts.title,
    CLUB,
  ].filter((line, i, all) => !(line === "" && all[i - 1] === "")).join("\n").trim() + "\n";
  return { ...parts, text };
}

export const subject = `Thank you for your gift to ${CLUB}`;
