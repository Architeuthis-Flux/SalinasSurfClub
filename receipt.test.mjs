// Self-check for the donation receipt wording:  npm test
import assert from "node:assert/strict";
import { letter, missing, money, TAX_ID } from "./receipt.js";

// Amounts.
assert.deepEqual([money(250), money("250"), money("$1,250.5"), money(0.5), money(1234567.891)], ["$250", "$250", "$1,250.50", "$0.50", "$1,234,567.89"]);
for (const bad of [0, -5, "", "abc", null, undefined, NaN, Infinity]) assert.equal(money(bad), "", String(bad));

// A complete letter: the club's own wording, with what was typed in its place.
const full = { date: "2026-11-23", donor: "Pat Example", address: "1 Main St\nSalinas, CA 93901\n", greeting: "", amount: "250", giftDate: "2026-11-20", signer: "Sa Vanna Baker Leyva", title: "Board Chair" };
assert.deepEqual(missing(full), []);
const made = letter(full);
assert.equal(made.date, "November 23, 2026");
assert.equal(made.salutation, "Dear Pat,");                                   // first name, unless one is typed
assert.equal(letter({ ...full, greeting: "Mr. Example" }).salutation, "Dear Mr. Example,");
assert.deepEqual(made.address, ["1 Main St", "Salinas, CA 93901"]);
assert.ok(made.body[0].startsWith("Thank you for making a $250 donation on November 20, 2026 to Salinas Surf Club."));
assert.ok(made.body[2].includes(`tax identification number of ${TAX_ID}`) && TAX_ID === "33-2185571");
assert.ok(made.body[2].endsWith("No goods or services were exchanged for this contribution."));
assert.ok(made.text.includes("Pat Example\n1 Main St\nSalinas, CA 93901\n\nDear Pat,"));
assert.ok(made.text.endsWith("With deep gratitude,\nSa Vanna Baker Leyva\nBoard Chair\nSalinas Surf Club\n"));
assert.ok(!/undefined|null|NaN/.test(made.text) && !made.text.includes("\n\n\n"));

// An unfinished form says what is missing, and the letter shows the blanks instead of nonsense.
assert.deepEqual(missing({}), ["the donor's name", "the amount", "the date of the gift", "the date of the letter", "who is signing"]);
assert.deepEqual(missing({ ...full, amount: "-1", giftDate: "last week" }), ["the amount", "the date of the gift"]);
const blank = letter({});
assert.ok(blank.body[0].includes("[donation amount] donation on [date]") && blank.salutation === "Dear [First Name],");
assert.ok(!/undefined|null|NaN/.test(blank.text));

console.log("ok (donation receipt)");
