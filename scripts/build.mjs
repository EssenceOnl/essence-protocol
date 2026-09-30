import { cpSync, rmSync, mkdirSync, existsSync, readdirSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, extname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "src"), dist = resolve(root, "dist");
const need = ["index.html", "dashboard.html", "stake.html", "styles.css", "palette.css", "main.js", "lib.js", "config.js", "favicon.ico", "favicon-32.png", "apple-touch-icon.png", "logo-mark.png", "slide-hero.jpg", "partials/header.html", "partials/footer.html"];

const missing = need.filter((f) => !existsSync(resolve(src, f)));
if (missing.length) { console.error("build: missing " + missing.join(", ")); process.exit(1); }

// clear contents, not the dir itself: a dev server or shell sitting in dist/ locks the folder on Windows
mkdirSync(dist, { recursive: true });
for (const f of readdirSync(dist)) rmSync(resolve(dist, f), { recursive: true, force: true });
cpSync(src, dist, { recursive: true, filter: (p) => { const r = relative(src, p).split(sep); return r[0] !== "partials" && r[r.length - 1] !== ".assets-stamp"; } });

// <!--#include name--> → src/partials/name.html
const part = (n) => readFileSync(resolve(src, "partials", n + ".html"), "utf8").trim();
for (const f of readdirSync(dist).filter((f) => extname(f) === ".html")) {
  const p = resolve(dist, f);
  const out = readFileSync(p, "utf8").replace(/<!--#include ([\w-]+)-->/g, (_, n) => part(n));
  if (/<!--#include/.test(out)) { console.error("build: unresolved include in " + f); process.exit(1); }
  writeFileSync(p, out);
}

let bytes = 0, n = 0;
for (const f of readdirSync(dist)) { bytes += statSync(resolve(dist, f)).size; n++; }
console.log(`build: ok — ${n} files, ${(bytes / 1024).toFixed(0)} KB → dist/`);
