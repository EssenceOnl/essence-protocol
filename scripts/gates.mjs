// 30 gates max. Synthetic fixtures only for data paths — no network. Timers are faked (fast clock).
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { load, pngInfo, decodePng, encodePng, resizePremul } from "./lib-img.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = (f) => resolve(root, "dist", f);
const read = (f) => readFileSync(dist(f), "utf8");
const gates = [];
const gate = (name, fn) => gates.push([name, fn]);
const ok = (c, m) => { if (!c) throw new Error(m || "assertion failed"); };
const eq = (a, b, m) => ok(Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b), `${m || "eq"}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

ok(existsSync(dist("index.html")), "dist/ missing — run npm run build first");
const PAGES = ["index.html", "dashboard.html", "stake.html"];
const pages = Object.fromEntries(PAGES.map((p) => [p, read(p)]));
const html = pages["index.html"], css = read("styles.css"), pal = read("palette.css"), main = read("main.js"), lib = read("lib.js");
const P = JSON.parse(read("palette.json"));
const L = await import(pathToFileURL(dist("lib.js")).href);
const { CFG } = await import(pathToFileURL(dist("config.js")).href);

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const tok = (r) => hexRgb(P.colors.find((c) => c.role === r).hex);

// ---- structure
gate("three pages + every asset built, includes resolved", () => {
  ["dashboard.html", "stake.html", "index.html", "styles.css", "palette.css", "main.js", "lib.js", "config.js", "favicon.ico", "favicon-32.png", "apple-touch-icon.png", "logo-mark.png", "slide-hero.jpg", "site.webmanifest", "palette.json"].forEach((f) => ok(existsSync(dist(f)), f));
  PAGES.forEach((p) => ok(!/<!--#include/.test(pages[p]) && (pages[p].match(/<nav /g) || []).length === 1, p));
  ok(!existsSync(dist("partials")));
});
gate("CA slot first in header, above nav, on every page", () => PAGES.forEach((p) => { const h = pages[p], c = h.indexOf('id="cabar"'); ok(c > 0 && c < h.indexOf("<nav ") && h.indexOf('<header class="top"') < c, p); }));
gate("CA slot inert while CA absent, no date", () => {
  eq(CFG.ca, ""); ok(/class="cabar is-inert"/.test(html) && /id="ca-val"[^>]*disabled/.test(html) && /id="ca-chart" hidden/.test(html) && /id="ca-explorer" hidden/.test(html));
  const s = html.slice(html.indexOf('id="cabar"'), html.indexOf("<nav ")); ok(!/\d{4}-\d{2}|\b(19|20)\d{2}\b|\d{1,2}\/\d{1,2}/.test(s), s);
});
gate("address validator strict; click-to-copy wires the full CA", () => {
  ok(L.isAddress("0x" + "aB".repeat(20)));
  ["0x" + "a".repeat(39), "0x" + "a".repeat(41), "0x" + "g".repeat(40), "a".repeat(42), "", null, undefined].forEach((v) => ok(!L.isAddress(v), String(v)));
  ok(/clipboard\.writeText\(CFG\.ca\)/.test(main) && /btn\.textContent = CFG\.ca/.test(main));
});
gate("socials inert, icon-only, top-right — all pages", () => {
  eq(CFG.x, ""); eq(CFG.github, "");
  PAGES.forEach((p) => {
    const h = pages[p];
    for (const id of ["soc-x", "soc-gh"]) {
      const m = h.match(new RegExp(`<a[^>]*id="${id}"[^>]*>`))[0]; ok(!/href=/.test(m) && /aria-disabled="true"/.test(m), id);
      const seg = h.slice(h.indexOf(`id="${id}"`)); ok(seg.slice(seg.indexOf(">") + 1, seg.indexOf("</a>")).replace(/<svg[\s\S]*<\/svg>/, "").trim() === "", id + " has text");
    }
    ok(h.indexOf('id="soc-x"') > h.indexOf('class="nlink"') && h.indexOf('id="soc-gh"') < h.indexOf('id="burger"'), p);
  });
});

// ---- real brand assets: IHDR, alpha, premultiplied resize
gate("real assets parsed: IHDR colour type, alpha, pure-black transparency detected", () => {
  const t = pngInfo(readFileSync(resolve(root, "brand/LOGO ESSENCE PNG...png"))), o = pngInfo(readFileSync(resolve(root, "brand/LOGO ESSENCE PNG.png")));
  eq([t.width, t.height, t.bitDepth, t.colorType], [2000, 2000, 8, 6]); eq([o.width, o.height, o.colorType], [2000, 2000, 6]);
  const r = P.report["brand/LOGO ESSENCE PNG...png"], r2 = P.report["brand/LOGO ESSENCE PNG.png"];
  ok(r.alpha.transparentPureBlack > 3_000_000 && r.premultipliedResize === true, "transparent logo must trigger premultiplied resize");
  eq(r2.alpha.transparent, 0); eq(r2.premultipliedResize, false);
});
gate("PNG codec round-trips (all filter paths) on a synthetic image", () => {
  const w = 17, h = 13, data = Buffer.alloc(w * h * 4); for (let i = 0; i < data.length; i++) data[i] = (i * 31 + (i >> 3)) & 255;
  const back = decodePng(encodePng({ width: w, height: h, data })); eq(back.width, w); ok(back.data.equals(data));
});
gate("premultiplied resize: pure-black transparent pixels never darken the edge", () => {
  const w = 8, h = 8, data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; if (x < 4) { data[o] = 54; data[o + 1] = 100; data[o + 2] = 68; data[o + 3] = 255; } } // right half: (0,0,0,0)
  const px = resizePremul({ width: w, height: h, data }, 3, 3), o = (1 * 3 + 1) * 4; // centre pixel straddles the edge
  ok(px.data[o + 3] > 0 && px.data[o + 3] < 255, "edge alpha should be partial");
  ok(Math.abs(px.data[o] - 54) <= 1 && Math.abs(px.data[o + 1] - 100) <= 1 && Math.abs(px.data[o + 2] - 68) <= 1, "edge colour bled toward black: " + [...px.data.slice(o, o + 3)]);
});
gate("palette provenance: every token IS the pixel at its recorded file@(x,y)", () => {
  ok(/k-means/.test(P.method) && P.colors.length >= 10);
  const cache = {};
  for (const c of P.colors) { const im = (cache[c.file] ||= load(resolve(root, c.file))); const o = (c.y * im.width + c.x) * 4; eq("#" + [...im.data.slice(o, o + 3)].map((v) => v.toString(16).padStart(2, "0")).join(""), c.hex, c.role); }
});
gate("palette.css mirrors palette.json and carries the provenance comment", () => {
  ok(/k-means/.test(pal) && /snapped to a real pixel/.test(pal));
  for (const c of P.colors) ok(new RegExp(`--${c.role}:\\s*${c.hex}`).test(pal) && pal.includes(`@ (${c.x},${c.y})`), c.role);
});
gate("WCAG contrast on sampled palette", () => {
  const bg = tok("bg"); ok(contrast(tok("ink"), bg) >= 7, "ink"); ok(contrast(tok("muted"), bg) >= 4.5, "muted"); ok(contrast(tok("accent"), bg) >= 4.5, "accent"); ok(contrast(tok("brand"), bg) >= 4.5, "brand");
});
gate("no stray colour literals: all colour comes from palette tokens", () => {
  const bad = []; const scan = (s, name) => { for (const m of s.matchAll(/#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g)) bad.push(name + ":" + m[0]); };
  scan(css, "styles.css"); scan(main, "main.js"); PAGES.forEach((p) => scan(pages[p].replace(/<meta name="theme-color"[^>]*>/g, ""), p));
  eq(bad, []);
  css.split("\n").forEach((l) => { if (/\bblack\b/.test(l)) ok(/mask-image/.test(l), "black outside mask: " + l.slice(0, 60)); });
});
gate("favicon set built from the real logo pixel grid (alpha preserved, no black fringe)", () => {
  const ico = readFileSync(dist("favicon.ico")); eq(ico.readUInt16LE(2), 1); eq(ico.readUInt16LE(4), 1); eq(ico[6], 32);
  const dims = { "favicon-32.png": 32, "logo-mark.png": 128, "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };
  for (const [f, n] of Object.entries(dims)) { const i = pngInfo(readFileSync(dist(f))); eq([i.width, i.height], [n, n], f); }
  const m = decodePng(readFileSync(dist("logo-mark.png"))); eq(m.data[3], 0, "corner transparent");
  let solid = 0; for (let i = 0; i < m.data.length; i += 4) if (m.data[i + 3] > 0) { ok(Math.max(m.data[i], m.data[i + 1], m.data[i + 2]) >= 40 && m.data[i + 1] >= m.data[i] && m.data[i + 1] >= m.data[i + 2], "black/off-hue fringe: " + [...m.data.slice(i, i + 4)]); if (m.data[i + 3] === 255) solid++; }
  ok(solid > 128 * 128 * 0.2, "mark too empty");
  const a = decodePng(readFileSync(dist("apple-touch-icon.png"))); ok(a.data.every((v, i) => i % 4 !== 3 || v === 255), "apple icon must be opaque");
});
gate("head: icons, manifest, og:image all resolve to real files", () => PAGES.forEach((p) => {
  const h = pages[p];
  for (const m of h.matchAll(/<link rel="(?:icon|apple-touch-icon|manifest|stylesheet)"[^>]*href="([^":]+)"/g)) ok(existsSync(dist(m[1])), p + " → " + m[1]);
  ok(/og:image" content="https:\/\/essence\.onl\/slide-hero\.jpg"/.test(h) && /theme-color/.test(h) && /<title>[^<]{3,}<\/title>/.test(h), p);
}));

// ---- chain + integrity
gate("Robinhood Chain 4663 + RPC configured", () => { eq(CFG.chainId, 4663); eq(CFG.rpc, "https://rpc.mainnet.chain.robinhood.com"); });
gate("no external scripts; read-only (no wallet/signing); no innerHTML; no forbidden paths", () => {
  PAGES.forEach((p) => { const s = [...pages[p].matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1]); ok(s.length && s.every((x) => !/^(https?:)?\/\//.test(x)), p); });
  ok(!/window\.ethereum|eth_sendTransaction|personal_sign|eth_requestAccounts|privateKey|mnemonic/i.test(main + lib));
  ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(main + lib));
  ["CLAUDE.md", ".claude", ".git"].forEach((p) => ok(!existsSync(resolve(root, p)), p));
});

// ---- pure helpers on synthetic fixtures
gate("formatters: hex, int, gwei, usd, pct, eth (BigInt exact), easing, sparkline", () => {
  eq(L.hexToNum("0x10"), 16); ok(Number.isNaN(L.hexToNum("nope"))); eq(L.fmtInt(1234567), "1,234,567"); eq(L.fmtInt(NaN), "—");
  eq(L.fmtGwei(20_000_000), "0.020"); eq(L.fmtGwei(2_500_000_000), "2.50"); eq(L.fmtUsd(0), "$0"); eq(L.fmtUsd(1500), "$1.5K"); eq(L.fmtUsd(2.5e6), "$2.50M"); eq(L.fmtPct(3.456), "+3.46%");
  eq(L.fmtEth("0x1bc16d674ec80000"), "2.0000"); eq(L.fmtEth(12345678901234567890n), "12.3456"); eq(L.fmtEth(10n ** 18n), "1.0000"); eq(L.fmtEth("bad"), "—");
  eq(L.easeOut(-1), 0); eq(L.easeOut(2), 1); ok(!/NaN/.test(L.sparkPath([], 600, 140).line) && !/NaN/.test(L.sparkPath([0, 0, 0], 600, 140).line));
  const g = L.sparkPath([1, 5, 3], 600, 140); eq(g.points.length, 3); eq(g.points[2][0], 600); ok(g.points[1][1] < g.points[0][1]);
});
const hx = (n) => "0x" + n.toString(16);
const rpc = (top, fail = false) => async (_u, opt) => {
  if (fail) throw new Error("down");
  const calls = JSON.parse(opt.body);
  return { json: async () => calls.map((c) => ({ id: c.id, result:
    c.method === "eth_blockNumber" ? hx(top) : c.method === "eth_gasPrice" ? hx(20_000_000) : c.method === "eth_chainId" ? hx(4663) :
    c.method === "eth_getBalance" ? hx(2n * 10n ** 18n + 5n * 10n ** 14n) : c.method === "eth_getTransactionCount" ? "0x7" : c.method === "eth_getCode" ? (c.params[0].endsWith("c0de") ? "0x6080" : "0x") :
    { timestamp: hx(1000 + (parseInt(c.params[0], 16) - (top - 7)) * 2), gasUsed: hx(21000), transactions: new Array(parseInt(c.params[0], 16) % 5) } })) };
};
gate("loadChain on synthetic RPC (+ failure path)", async () => {
  const c = await L.loadChain(rpc(100), "x", 8); eq(c.block, 100); eq(c.chainId, 4663); eq(c.gasWei, 20_000_000); eq(c.blocks.length, 8); eq(c.blocks[0].n, 93); eq(c.blockTime, 2);
  let t = false; try { await L.loadChain(rpc(1, true), "x"); } catch { t = true; } ok(t);
});
gate("loadTvl + loadPairs on synthetic sources", async () => {
  const mk = (arr) => async () => ({ json: async () => arr.map((tvl, i) => ({ date: 1e9 + i * 86400, tvl })) });
  const a = await L.loadTvl(mk(Array.from({ length: 40 }, (_, i) => (i < 10 ? 100 : 150))), "n"); eq(a.last, 150); eq(a.change, 50);
  const z = await L.loadTvl(mk(new Array(40).fill(0)), "n"); ok(Number.isNaN(z.change));
  const p = (chainId, liq, url) => ({ chainId, pairAddress: "0x" + liq, dexId: "uniswap", labels: ["v4"], baseToken: { symbol: "AAA" }, quoteToken: { symbol: "ETH" }, priceUsd: "1.5", priceChange: { h24: 2 }, liquidity: { usd: liq }, volume: { h24: 9 }, url });
  const r = await L.loadPairs(async () => ({ json: async () => ({ pairs: [p("robinhood", 10, "https://dexscreener.com/a"), p("solana", 999, "https://dexscreener.com/b"), p("robinhood", 50, "javascript:alert(1)")] }) }), "robinhood", "");
  eq(r.length, 2); eq(r[0].liq, 50); eq(r[0].url, ""); eq(r[1].url, "https://dexscreener.com/a"); eq(r[0].dex, "uniswap v4");
});
gate("loadWallet: balance/nonce/type from synthetic RPC, bad address rejected", async () => {
  const w = await L.loadWallet(rpc(1), "x", "0x" + "1".repeat(40)); eq(w.eth, "2.0005"); eq(w.nonce, 7); eq(w.contract, false);
  eq((await L.loadWallet(rpc(1), "x", "0x" + "0".repeat(36) + "c0de")).contract, true);
  let t = false; try { await L.loadWallet(rpc(1), "x", "0x123"); } catch { t = true; } ok(t);
});
gate("poller on fast clock: cadence, error-tolerance, stop", async () => {
  const q = []; let n = 0; const timer = (fn, ms) => { q.push([fn, ms]); return q.length; };
  const p = L.createPoller(timer, async () => { n++; if (n === 2) throw new Error("blip"); }, 8000);
  for (let i = 0; i < 4; i++) { await new Promise((r) => setImmediate(r)); const j = q.shift(); if (j) { eq(j[1], 8000); await j[0](); } }
  ok(n >= 3, "polled " + n); p.stop(); const before = n; const j = q.shift(); if (j) await j[0](); eq(n, before);
});

// ---- pages: stake gate, premium, mobile
gate("stake + fleet gated: controls disabled, overlay on, no wallet-connect code", () => {
  const s = pages["stake.html"]; ok(/class="gate off/.test(s));
  const ctl = [...s.matchAll(/<(button|input)\b[^>]*>/g)].map((m) => m[0]).filter((t) => !/id="burger"/.test(t)); ok(ctl.length >= 7 && ctl.every((t) => /disabled/.test(t)), "enabled control on stake page");
  ok(/class="gate off/.test(pages["dashboard.html"]) && /w-form/.test(pages["dashboard.html"]));
});
gate("premium: JS-gated entrance, scroll progress, marquee, floaty art, reduced-motion honoured", () => {
  ok(/\.js \.rv\{opacity:0/.test(css) && /IntersectionObserver/.test(main) && /getElementById\("progress"\)|\$\("progress"\)/.test(main));
  ok(/@keyframes mq/.test(css) && /@keyframes floaty/.test(css) && /@keyframes grow/.test(css) && /@keyframes shim/.test(css));
  ok(/prefers-reduced-motion:reduce/.test(css) && /prefers-reduced-motion: reduce/.test(main));
});
gate("mobile polish: viewport, breakpoints, safe-area, 40px targets, table→cards, no dark-mode drift", () => {
  ok(/viewport-fit=cover/.test(html) && /max-width:680px/.test(css) && /max-width:600px/.test(css) && /max-width:900px/.test(css) && /env\(safe-area-inset/.test(css) && /\.burger\{[^}]*width:40px/.test(css) && /max-width:760px[\s\S]*\.tr\.th\{display:none\}/.test(css));
  ok(!/prefers-color-scheme/.test(css), "brand is light-only");
});
gate("every data-bind key has a target and a writer; brand fonts + assets referenced", () => {
  for (const k of ["block", "gas", "btime", "tx", "tvl", "tvlchg", "chainid", "pairn"]) ok(html.includes(`data-bind="${k}"`) && main.includes(`bind("${k}"`), k);
  ok(/Plus\+Jakarta\+Sans/.test(html) && /IBM\+Plex\+Mono/.test(html) && /slide-hero\.jpg/.test(css) && /logo-mark\.png/.test(pages["dashboard.html"]));
});
gate("bundle budget: css+js ≤ 100 KB, whole dist ≤ 1 MB", () => {
  const sz = (f) => statSync(dist(f)).size; ok(["styles.css", "palette.css", "main.js", "lib.js", "config.js"].reduce((a, f) => a + sz(f), 0) <= 100 * 1024);
  ok(readdirSync(resolve(root, "dist")).reduce((a, f) => a + sz(f), 0) <= 1024 * 1024);
});

let fail = 0;
ok(gates.length <= 30, `${gates.length} gates > 30`);
for (const [name, fn] of gates) {
  try { await fn(); console.log("  ✓ " + name); } catch (e) { fail++; console.log("  ✗ " + name + "\n      " + e.message); }
}
console.log(`\ngates: ${gates.length - fail}/${gates.length} passed`);
process.exit(fail ? 1 : 0);
