// Compares the app's in-browser segmenter with the Python evaluation on held-out sentences.
const fs = require("fs"); const path = require("path");
const { createCore } = require("../app/core.js");
const root = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "app/data", f), "utf8"));
const core = createCore({ dict: read("dict.json"), parts: read("parts.json"), grammar: read("grammar.json") });
const order = read("order.json").unlock.filter((i) => i < core.n);
const held = fs.readFileSync(path.join(root, "data/graph/holdout_sentences.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l).text);
const toks = held.flatMap((t) => core.tokenise(t).filter((x) => x.han));
const pos = new Map(order.map((u, i) => [u, i + 1]));
const out = { tokens: toks.length, outside: toks.filter((t) => t.unit === null).length };
for (const n of [100, 500, 1000, 2000]) out[n] = +(toks.filter((t) => t.unit !== null && pos.get(t.unit) <= n).length / toks.length * 100).toFixed(2);
console.log(JSON.stringify(out));
