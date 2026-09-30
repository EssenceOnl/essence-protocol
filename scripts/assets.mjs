// Samples brand/ + reference/ and writes: src/palette.json, src/palette.css, favicons, logo mark, hero art.
// Every colour token is a REAL pixel of a source file (k-means centroid or target, snapped to the nearest real pixel, coordinate recorded).
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load, pngInfo, encodePng, resizePremul } from "./lib-img.mjs";
import { readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const P = (...a) => resolve(root, ...a);
mkdirSync(P("src"), { recursive: true });

// skip when inputs + this script are unchanged (pass --force to resample)
const stampInputs = [...["brand", "reference"].flatMap((d) => readdirSync(P(d)).sort().map((f) => { const st = statSync(P(d, f)); return d + "/" + f + ":" + st.size + ":" + st.mtimeMs; })), "script:" + statSync(fileURLToPath(import.meta.url)).mtimeMs + ":" + statSync(P("scripts/lib-img.mjs")).mtimeMs];
const stamp = createHash("sha1").update(stampInputs.join("|")).digest("hex");
if (!process.argv.includes("--force") && existsSync(P("src/.assets-stamp")) && readFileSync(P("src/.assets-stamp"), "utf8") === stamp && existsSync(P("src/palette.json"))) { console.log("assets: up to date (sources unchanged)"); process.exit(0); }

const LOGO_T = "brand/LOGO ESSENCE PNG...png"; // true alpha
const LOGO_O = "brand/LOGO ESSENCE PNG.png"; // opaque white background
const LOGO_J = "brand/LOGO ESSENCE JPG.jpg.jpeg";
const REFS = ["reference/ESSENCE 1.jpg.jpeg", "reference/SAMPUL ESSENCE JPG.jpg.jpeg"];

const hex = (c) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/* ---- 1. IHDR / alpha report ---- */
const report = {};
for (const f of [LOGO_T, LOGO_O]) {
  const buf = readFileSync(P(f)), info = pngInfo(buf), im = load(P(f));
  let zero = 0, zeroBlack = 0, partial = 0, opaque = 0;
  for (let i = 0; i < im.data.length; i += 4) { const a = im.data[i + 3]; if (a === 0) { zero++; if (!(im.data[i] | im.data[i + 1] | im.data[i + 2])) zeroBlack++; } else if (a === 255) opaque++; else partial++; }
  report[f] = { width: info.width, height: info.height, bitDepth: info.bitDepth, colorType: info.colorType, alpha: { transparent: zero, transparentPureBlack: zeroBlack, partial, opaque }, premultipliedResize: zeroBlack > 0 };
}
const alphaLogo = report[LOGO_T].premultipliedResize;

/* ---- 2. pixel pool + k-means ---- */
const imgs = {};
for (const f of [LOGO_T, ...REFS]) imgs[f] = load(P(f));
const px = (im, x, y) => { const o = (y * im.width + x) * 4; return [im.data[o], im.data[o + 1], im.data[o + 2]]; };
const pool = [];
for (const f of [LOGO_T, ...REFS]) { const im = imgs[f], n = im.width * im.height, step = Math.max(1, Math.floor(n / 40000)); for (let i = 0; i < n; i += step) if (im.data[i * 4 + 3] > 250) pool.push([im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]]); }

function kmeans(pts, k, iters = 30) {
  let cs = [pts[0]];
  while (cs.length < k) { let best = -1, bi = 0; for (let i = 0; i < pts.length; i += 3) { let d = Infinity; for (const c of cs) d = Math.min(d, d2(pts[i], c)); if (d > best) { best = d; bi = i; } } cs.push(pts[bi]); }
  const cnt = new Array(k).fill(0);
  for (let t = 0; t < iters; t++) {
    const s = cs.map(() => [0, 0, 0, 0]);
    for (const p of pts) { let b = 0, bd = Infinity; for (let c = 0; c < k; c++) { const d = d2(p, cs[c]); if (d < bd) { bd = d; b = c; } } s[b][0] += p[0]; s[b][1] += p[1]; s[b][2] += p[2]; s[b][3]++; }
    cs = s.map((v, c) => (v[3] ? [v[0] / v[3], v[1] / v[3], v[2] / v[3]] : cs[c])); s.forEach((v, c) => (cnt[c] = v[3]));
  }
  return cs.map((c, i) => ({ c, share: cnt[i] / pts.length }));
}
const clusters = kmeans(pool, 10);

/* ---- 3. snap a target colour to the nearest REAL pixel (records file + x,y) ---- */
function snap(target, prefer) {
  let best = null;
  for (const f of prefer || [LOGO_T, ...REFS]) {
    const im = imgs[f];
    for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++) {
      const o = (y * im.width + x) * 4; if (im.data[o + 3] < 255) continue;
      const d = (im.data[o] - target[0]) ** 2 + (im.data[o + 1] - target[1]) ** 2 + (im.data[o + 2] - target[2]) ** 2;
      if (!best || d < best.d) best = { d, f, x, y, c: [im.data[o], im.data[o + 1], im.data[o + 2]] };
      if (d === 0) return { file: f, x, y, c: best.c };
    }
  }
  return { file: best.f, x: best.x, y: best.y, c: best.c };
}

/* ---- 4. roles ---- */
const byShare = [...clusters].sort((a, b) => b.share - a.share);
const near = (L, skip = []) => clusters.filter((k) => !skip.includes(k)).sort((a, b) => Math.abs(lum(a.c) - L) - Math.abs(lum(b.c) - L))[0];
const bgK = byShare.find((k) => lum(k.c) > 0.8);
const inkK = clusters.filter((k) => k.share > 0.01).sort((a, b) => lum(a.c) - lum(b.c))[0];
const logoPts = []; { const im = imgs[LOGO_T]; for (let i = 0; i < im.width * im.height; i += 5) if (im.data[i * 4 + 3] > 250) logoPts.push([im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]]); }
const logoOnly = kmeans(logoPts, 6).sort((a, b) => b.share - a.share)[0];
const sat = (c) => (Math.max(...c) - Math.min(...c)) / (Math.max(...c) || 1);
const accentK = clusters.filter((k) => lum(k.c) > 0.04 && lum(k.c) < 0.3 && d2(k.c, inkK.c) > 400).sort((a, b) => sat(b.c) - sat(a.c))[0];
const softK = near(0.68), faintK = near(0.36, [softK]), midK = near(0.2, [softK, faintK]), tintK = near(0.5, [softK, faintK, midK]);

const bg = snap(bgK.c, REFS);
const ink = snap(inkK.c, REFS);
const brand = snap(logoOnly.c, [LOGO_T]);
const accent = snap(accentK.c, REFS);
const soft = snap(softK.c, REFS), faint = snap(faintK.c, REFS), mid = snap(midK.c, REFS), tint = snap(tintK.c, REFS);
let muted; for (let t = 0.4; t <= 1.001; t += 0.05) { const m = snap(mix(bg.c, ink.c, t), REFS); if (contrast(m.c, bg.c) >= 5.2) { muted = m; break; } }
if (!muted) muted = ink;
const surface2 = snap(mix(bg.c, soft.c, 0.28), REFS), hover = snap(mix(bg.c, soft.c, 0.55), REFS);


const roles = { bg, "surface-2": surface2, hover, soft, tint, faint, mid, muted, brand, accent, ink };
const colors = Object.entries(roles).map(([role, s]) => ({ role, hex: hex(s.c), file: s.file, x: s.x, y: s.y, contrast_on_bg: +contrast(s.c, bg.c).toFixed(2) }));

const palette = {
  method: "k-means (k=10, deterministic farthest-point init, 30 iters) over pooled opaque pixels of the real assets; every token snapped to the nearest real pixel; file + x,y recorded",
  sources: [LOGO_T, ...REFS],
  clusters: clusters.sort((a, b) => b.share - a.share).map((k) => ({ hex: hex(k.c), share: +k.share.toFixed(4) })),
  colors, report,
};
writeFileSync(P("src/palette.json"), JSON.stringify(palette, null, 2) + "\n");

const H = Object.fromEntries(colors.map((c) => [c.role, c.hex]));
writeFileSync(P("src/palette.css"), `/* GENERATED by scripts/assets.mjs — do not edit.
 * Palette sampled from the real brand/ + reference/ assets.
 * Method: k-means (k=10) over pooled opaque pixels, each token snapped to a real pixel coordinate (see palette.json).
${colors.map((c) => ` *   --${c.role.padEnd(9)} ${c.hex}  ${c.file} @ (${c.x},${c.y})`).join("\n")}
 */
:root{
  --bg:${H.bg}; --surface-2:${H["surface-2"]}; --hover:${H.hover}; --soft:${H.soft}; --tint:${H.tint};
  --faint:${H.faint}; --mid:${H.mid}; --muted:${H.muted}; --brand:${H.brand}; --accent:${H.accent}; --ink:${H.ink};
}
`);

/* ---- 5. favicon + logo mark from the REAL logo pixel grid ---- */
const logo = imgs[LOGO_T];
let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
for (let y = 0; y < logo.height; y++) for (let x = 0; x < logo.width; x++) if (logo.data[(y * logo.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
const side = Math.max(x1 - x0 + 1, y1 - y0 + 1), pad = Math.round(side * 0.06), S = side + pad * 2;
const cx = Math.round((x0 + x1) / 2), cy = Math.round((y0 + y1) / 2);
const sq = { width: S, height: S, data: Buffer.alloc(S * S * 4) };
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const sx = cx - (S >> 1) + x, sy = cy - (S >> 1) + y;
  if (sx >= 0 && sy >= 0 && sx < logo.width && sy < logo.height) logo.data.copy(sq.data, (y * S + x) * 4, (sy * logo.width + sx) * 4, (sy * logo.width + sx) * 4 + 4);
}
const rs = (n) => (alphaLogo ? resizePremul(sq, n, n) : resizePremul(sq, n, n)); // premultiplied path is safe for both; required when transparent px are pure black
const out = (n, name) => writeFileSync(P("src", name), encodePng(rs(n)));
out(32, "favicon-32.png"); out(192, "icon-192.png"); out(512, "icon-512.png"); out(128, "logo-mark.png");
// apple-touch-icon must be opaque: composite the mark over the sampled bg colour
{
  const a = rs(180), bgc = bg.c;
  for (let i = 0; i < a.data.length; i += 4) { const al = a.data[i + 3] / 255; for (let k = 0; k < 3; k++) a.data[i + k] = Math.round(a.data[i + k] * al + bgc[k] * (1 - al)); a.data[i + 3] = 255; }
  writeFileSync(P("src/apple-touch-icon.png"), encodePng(a));
}
// .ico wrapping the 32px PNG
{
  const png = encodePng(rs(32)), h = Buffer.alloc(22);
  h.writeUInt16LE(0, 0); h.writeUInt16LE(1, 2); h.writeUInt16LE(1, 4); h[6] = 32; h[7] = 32; h.writeUInt16LE(1, 10); h.writeUInt16LE(32, 12); h.writeUInt32LE(png.length, 14); h.writeUInt32LE(22, 18);
  writeFileSync(P("src/favicon.ico"), Buffer.concat([h, png]));
}
// brand imagery used on the page
copyFileSync(P(REFS[0]), P("src/slide-hero.jpg"));
writeFileSync(P("src/logo-source.json"), JSON.stringify({ file: LOGO_T, bbox: [x0, y0, x1, y1], square: S, premultipliedResize: alphaLogo }, null, 2) + "\n");

writeFileSync(P("src/.assets-stamp"), stamp);
console.log(`assets: ok — ${colors.length} tokens sampled; logo bbox ${x1 - x0 + 1}x${y1 - y0 + 1}; premultiplied resize: ${alphaLogo}`);
colors.forEach((c) => console.log(`  --${c.role.padEnd(9)} ${c.hex}  ${c.file.split("/").pop()} @ (${c.x},${c.y})  contrast ${c.contrast_on_bg}`));
