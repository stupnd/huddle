/**
 * Offline checks for the plan-vs-budget detector: which stated budgets are comparable, when the plan
 * counts as over, and that the alert never leaks a budget number. No database or model calls.
 *
 *   npx tsx scripts/check-budget.ts
 */
import assert from "node:assert/strict";
import { budgetGap, composeBudgetAlert, parseBudget } from "../lib/agents/budget";

// stated budgets, as people actually type them
assert.equal(parseBudget("$1500 total", 5), 1500);
assert.equal(parseBudget("around 2k", 5), 2000);
assert.equal(parseBudget("$1,200 for the trip", 5), 1200);
assert.equal(parseBudget("$100 a day", 5), 500, "a daily budget scales with the plan's days");
assert.equal(parseBudget("$100 a day", 0), null, "no days, nothing to scale");
assert.equal(parseBudget("$200 for food", 5), null, "one part of the trip is not comparable with the whole plan");
assert.equal(parseBudget("$3000 total including food", 5), 3000, "an explicit total still counts");
assert.equal(parseBudget("$80 a night", 5), null);
assert.equal(parseBudget("keep it cheap", 5), null);
assert.equal(parseBudget("2 nights", 5), null, "a small number is not a budget");

const item = (title: string, cost: number, day = "Jan 1") => ({ title, est_cost_per_person: cost, day_label: day });
const plan = [item("Fairmont Lake Louise", 400), item("Johnston Canyon icewalk", 162, "Jan 2"), item("Helicopter tour", 450, "Jan 3"), item("Dinner", 60, "Jan 3")];

// plan totals $1072; the tightest budget decides
const over = budgetGap(plan, ["$3000 total", "$500 total"]);
assert.equal(over?.total, 1072);
assert.deepEqual(over?.top.map((i) => i.title), ["Helicopter tour", "Fairmont Lake Louise"]);
assert.equal(budgetGap(plan, ["$3000 total", "$1000 total"])?.total, 1072, "just over one person's cap still counts");
assert.equal(budgetGap(plan, ["$1050 total"]), null, "within 5% is not worth a message");
assert.equal(budgetGap(plan, ["$3000 total"]), null, "everyone fits");
assert.equal(budgetGap(plan, ["keep it cheap"]), null, "nothing comparable, so stay quiet");
assert.equal(budgetGap([], ["$100 total"]), null, "no plan yet");

// the alert uses public prices only and never a person's number
const alert = composeBudgetAlert(over!.total, over!.top, "Nova");
assert.match(alert, /@Nova/);
assert.match(alert, /Helicopter tour \$450/);
assert.ok(!alert.includes("500") || alert.includes("$450"), "no budget figure in the message");
assert.ok(!/\$500\b/.test(alert), "the tightest budget is never named");

console.log("budget checks passed");
