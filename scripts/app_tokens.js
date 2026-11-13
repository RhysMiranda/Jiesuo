// Reads a JSON list of texts on stdin and prints the app's Han tokens for each.
const fs = require("fs"), path = require("path");
const { createCore } = require("../app/core.js");
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "../app/data", f), "utf8"));
const core = createCore({ dict: read("dict.json"), parts: read("parts.json"), grammar: read("grammar.json") });
const texts = JSON.parse(fs.readFileSync(0, "utf8"));
process.stdout.write(JSON.stringify(texts.map((t) => core.tokenise(t).filter((x) => x.han).map((x) => x.text))));
