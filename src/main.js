import { CFG } from "./config.js";
import { isAddress, fmtInt, fmtGwei, fmtUsd, fmtPct, easeOut, ago, sparkPath, loadChain, loadTvl, loadPairs, loadWallet, createPoller } from "./lib.js";

const $ = (id) => document.getElementById(id);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const state = { lastOk: 0, prev: {} };
const page = document.body.dataset.page;

/* ---------- number binding with count-up + change flash ---------- */
function bind(key, value, fmt, animate = true) {
  const els = document.querySelectorAll(`[data-bind="${key}"]`);
  const text = fmt(value);
  const prev = state.prev[key];
  state.prev[key] = value;
  els.forEach((el) => {
    if (animate && !reduce && Number.isFinite(prev) && Number.isFinite(value) && prev !== value && Math.abs(value - prev) < 1e12) {
      const t0 = performance.now(), dur = 700;
      const step = (t) => {
        const p = easeOut((t - t0) / dur);
        el.textContent = p >= 1 ? text : fmt(prev + (value - prev) * p);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    } else el.textContent = text;
    const host = el.closest(".tile");
    if (host && prev !== undefined && prev !== value) { host.classList.remove("flash"); void host.offsetWidth; host.classList.add("flash"); }
  });
}

function setStatus(kind, text) {
  const s = $("status");
  if (!s) return;
  s.className = "pill " + kind;
  $("status-txt").textContent = text;
}

/* ---------- CA slot + socials: inert until stated ---------- */
function wireIdentity() {
  const cabar = $("cabar"), btn = $("ca-val");
  if (isAddress(CFG.ca)) {
    cabar.classList.remove("is-inert");
    btn.disabled = false; btn.removeAttribute("aria-disabled");
    btn.textContent = CFG.ca; btn.title = "Click to copy";
    $("ca-state").textContent = "Click to copy";
    const ex = $("ca-explorer");
    ex.href = CFG.explorer + "/token/" + CFG.ca; ex.hidden = false;
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(CFG.ca); } catch { return; }
      const t = $("toast"); t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 1200);
    });
  }
  for (const [id, url, label] of [["soc-x", CFG.x, "X"], ["soc-gh", CFG.github, "GitHub"]]) {
    const el = $(id);
    if (/^https:\/\//.test(url || "")) {
      el.href = url; el.target = "_blank"; el.rel = "noopener noreferrer"; el.removeAttribute("aria-disabled"); el.removeAttribute("role");
      el.setAttribute("aria-label", label); el.title = label;
    }
  }
  document.querySelectorAll(`.nbtn[data-page="${page}"]`).forEach((a) => a.setAttribute("aria-current", "page"));
}

/* ---------- chrome: nav drawer, progress, reveal, spy ---------- */
function wireChrome() {
  const burger = $("burger"), drawer = $("drawer");
  burger.addEventListener("click", () => {
    const open = drawer.classList.toggle("open");
    burger.setAttribute("aria-expanded", String(open));
  });
  drawer.addEventListener("click", (e) => { if (e.target.closest("a")) { drawer.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); } });
  addEventListener("keydown", (e) => { if (e.key === "Escape" && drawer.classList.contains("open")) { drawer.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); burger.focus(); } });

  const bar = $("progress");
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const h = document.documentElement, span = h.scrollHeight - h.clientHeight;
      bar.style.transform = `scaleX(${span > 0 ? h.scrollTop / span : 0})`;
    });
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  const rv = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add("in"); io.unobserve(e.target);
      const c = e.target.querySelector(".chart"); if (c) c.classList.add("drawn");
    }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    rv.forEach((n) => io.observe(n));
    const links = document.querySelectorAll(".nlink");
    const spy = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) links.forEach((l) => l.classList.toggle("on", (l.getAttribute("href") || "").endsWith("#" + e.target.id)));
    }), { rootMargin: "-40% 0px -55% 0px" });
    if (page === "home") document.querySelectorAll("section[id]").forEach((s) => spy.observe(s));
  } else rv.forEach((n) => n.classList.add("in"));
  setTimeout(() => { rv.forEach((n) => n.classList.add("in")); document.querySelectorAll(".chart").forEach((c) => c.classList.add("drawn")); }, 4000); // never leave content hidden
}

/* ---------- chain ---------- */
let lastBlock = 0;
function renderBlocks(blocks) {
  const wrap = $("blocks");
  if (!wrap) return;
  const max = Math.max(1, ...blocks.map((b) => b.tx));
  wrap.textContent = "";
  blocks.forEach((b, idx) => {
    const d = document.createElement("div");
    d.className = "bk" + (b.n > lastBlock && lastBlock ? " new" : "");
    const em = document.createElement("em"); em.textContent = fmtInt(b.tx);
    const i = document.createElement("i"); i.style.height = Math.max(3, (b.tx / max) * 88) + "%"; i.style.animationDelay = idx * 40 + "ms";
    const s = document.createElement("small"); s.textContent = "#" + String(b.n).slice(-5);
    d.append(em, i, s); wrap.append(d);
  });
}

async function pollChain() {
  try {
    const c = await loadChain(fetch.bind(window), CFG.rpc, 8);
    bind("block", c.block, fmtInt, false);
    bind("gas", c.gasWei, fmtGwei);
    bind("btime", c.blockTime, (v) => (Number.isFinite(v) ? v.toFixed(2) + "s" : "—"));
    bind("tx", c.blocks.length ? c.blocks[c.blocks.length - 1].tx : NaN, fmtInt);
    if (Number.isFinite(c.chainId)) bind("chainid", c.chainId, fmtInt, false);
    if (c.block !== lastBlock) {
      renderBlocks(c.blocks);
      const p = $("pulse"); if (p) { p.classList.remove("beat"); void p.offsetWidth; p.classList.add("beat"); }
    }
    lastBlock = c.block; state.lastOk = Date.now();
    setStatus("live", "Live");
  } catch {
    setStatus("err", "RPC unreachable");
  }
}

/* ---------- TVL chart ---------- */
let series = [];
async function pollTvl() {
  try {
    const t = await loadTvl(fetch.bind(window), CFG.llamaChain);
    series = t.series;
    bind("tvl", t.last, fmtUsd, false);
    bind("tvlchg", t.change, (v) => (Number.isFinite(v) ? fmtPct(v) : "n/a"), false);
    if (!$("chart")) return;
    $("chart-read").textContent = t.series.length ? fmtUsd(t.last) : "no data";
    const g = sparkPath(t.series.map((p) => p.tvl), 600, 140);
    $("ch-line").setAttribute("d", g.line); $("ch-area").setAttribute("d", g.area);
  } catch {
    bind("tvl", NaN, fmtUsd, false);
    if ($("chart-read")) $("chart-read").textContent = "TVL source unreachable";
  }
}

function wireChart() {
  const chart = $("chart");
  if (!chart) return;
  const tip = $("tip"), x = $("ch-x");
  const move = (e) => {
    if (!series.length) return;
    const r = chart.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const p = series[Math.round(f * (series.length - 1))];
    x.setAttribute("x1", f * 600); x.setAttribute("x2", f * 600); x.setAttribute("opacity", "1");
    tip.style.left = Math.min(r.width - 60, Math.max(60, f * r.width)) + "px";
    tip.textContent = new Date(p.date * 1000).toISOString().slice(0, 10) + " · " + fmtUsd(p.tvl);
    tip.classList.add("on");
  };
  const out = () => { tip.classList.remove("on"); x.setAttribute("opacity", "0"); };
  chart.addEventListener("pointermove", move); chart.addEventListener("pointerdown", move);
  chart.addEventListener("pointerleave", out); chart.addEventListener("pointercancel", out);
}

/* ---------- pairs ---------- */
const cell = (cls, label, child) => { const s = document.createElement("span"); if (cls) s.className = cls; s.dataset.l = label; s.append(child); return s; };
async function pollPairs() {
  const body = $("pairs-body");
  try {
    const list = await loadPairs(fetch.bind(window), CFG.dexChain, CFG.ca);
    bind("pairn", list.length, fmtInt, false);
    if (isAddress(CFG.ca) && list[0] && list[0].url) { const c = $("ca-chart"); c.href = list[0].url; c.hidden = false; }
    if (!body) return;
    body.textContent = "";
    if (!list.length) { const e = document.createElement("div"); e.className = "empty"; e.textContent = "No pairs returned by DexScreener right now."; body.append(e); return; }
    list.forEach((p, i) => {
      const a = document.createElement(p.url ? "a" : "div");
      a.className = "tr"; a.style.setProperty("--i", i); a.setAttribute("role", "row");
      if (p.url) { a.href = p.url; a.target = "_blank"; a.rel = "noopener noreferrer"; }
      const pair = document.createElement("span"); pair.className = "pair";
      const b = document.createElement("b"); b.textContent = p.base; const q = document.createElement("span"); q.textContent = " / " + p.quote;
      pair.append(b, q);
      const ch = document.createElement("span"); ch.textContent = fmtPct(p.change); ch.className = p.change >= 0 ? "up" : "down";
      a.append(pair, cell("", "DEX", document.createTextNode(p.dex || "—")), cell("r tnum", "Price", document.createTextNode(fmtUsd(p.price))),
        cell("r tnum", "24h", ch), cell("r tnum", "Liquidity", document.createTextNode(fmtUsd(p.liq))), cell("r tnum", "Volume 24h", document.createTextNode(fmtUsd(p.vol))));
      body.append(a);
    });
  } catch {
    if (!body) return;
    body.textContent = ""; const e = document.createElement("div"); e.className = "empty"; e.textContent = "DexScreener unreachable. Retrying."; body.append(e);
  }
}

/* ---------- wallet check (read-only RPC) ---------- */
function wireWallet() {
  const form = $("w-form");
  if (!form) return;
  const box = form.closest(".check"), note = $("w-note");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const addr = $("w-addr").value.trim();
    box.classList.remove("bad");
    if (!isAddress(addr)) { box.classList.add("bad"); note.textContent = "Enter a full address: 0x followed by 40 hex characters."; return; }
    note.textContent = "Reading from the RPC…";
    try {
      const w = await loadWallet(fetch.bind(window), CFG.rpc, addr);
      $("w-bal").textContent = w.eth + " ETH"; $("w-nonce").textContent = fmtInt(w.nonce); $("w-kind").textContent = w.contract ? "Contract" : "Wallet";
      note.textContent = "Read live from Robinhood Chain. Nothing was connected or signed.";
    } catch { box.classList.add("bad"); note.textContent = "Could not read that address right now."; }
  });
}

/* ---------- boot ---------- */
wireIdentity(); wireChrome(); wireChart(); wireWallet();
const timer = (fn, ms) => setTimeout(fn, ms);
createPoller(timer, pollChain, CFG.chainPoll);
createPoller(timer, pollTvl, CFG.slowPoll);
createPoller(timer, pollPairs, CFG.slowPoll);
if ($("upd")) setInterval(() => { $("upd").textContent = state.lastOk ? ago(Date.now() - state.lastOk) + " ago" : "—"; }, 1000);
