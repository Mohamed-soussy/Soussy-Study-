/**
 * Copies the open-source NSFW.js MobileNetV2 model out of its JavaScript bundle into
 * public/nsfw (model.json + weights), so study rooms load it like the MediaPipe models:
 * from our own site, only when a room opens, and without slowing the build.
 * Run once after installing: node scripts/extract-nsfw-model.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "..", "node_modules", "nsfwjs", "dist", "models", "mobilenet_v2");
const model = require(path.join(dir, "model.min.js"));
const weights = Buffer.from(require(path.join(dir, "group1-shard1of1.min.js")), "base64");
const out = path.join(__dirname, "..", "public", "nsfw");
fs.mkdirSync(out, { recursive: true });
const manifest = model.weightsManifest.map((g) => ({ ...g, paths: ["group1-shard1of1.bin"] }));
fs.writeFileSync(path.join(out, "model.json"), JSON.stringify({ ...model, weightsManifest: manifest }));
fs.writeFileSync(path.join(out, "group1-shard1of1.bin"), weights);
console.log("wrote", out, (weights.length / 1e6).toFixed(1), "MB");
