// Pure helpers. No DOM, no globals — fetch and timers are injected so gates can run on a fast clock.

export const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;
export const isAddress = (a) => typeof a === "string" && ADDR_RE.test(a);

export const hexToNum = (h) => (typeof h === "string" && /^0x[0-9a-fA-F]+$/.test(h) ? parseInt(h, 16) : NaN);

export function fmtInt(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—";
}

export function fmtGwei(wei) {
  if (!Number.isFinite(wei)) return "—";
  const g = wei / 1e9;
  if (g === 0) return "0";
  if (g >= 100) return g.toFixed(0);
  if (g >= 1) return g.toFixed(2);
  if (g >= 0.001) return g.toFixed(3);
  return g.toExponential(1);
}

export function fmtUsd(n) {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e9) return "$" + (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return "$" + (n / 1e3).toFixed(1) + "K";
  if (a >= 1) return "$" + n.toFixed(2);
  if (a === 0) return "$0";
  return "$" + n.toPrecision(2);
}

export function fmtPct(n) {
  if (!Number.isFinite(n)) return "—";
  return (n > 0 ? "+" : "") + n.toFixed(2) + "%";
}

export const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return s < 60 ? s + "s" : Math.floor(s / 60) + "m";
}

// Sparkline geometry. Flat/empty series draw a centred line instead of NaN.
export function sparkPath(values, w, h, pad = 6) {
  const v = (values || []).filter(Number.isFinite);
  if (v.length < 2) return { line: `M0 ${h / 2}L${w} ${h / 2}`, area: "", points: [] };
  const min = Math.min(...v), max = Math.max(...v), span = max - min;
  const pts = v.map((x, i) => [
    (i / (v.length - 1)) * w,
    span === 0 ? h / 2 : pad + (1 - (x - min) / span) * (h - pad * 2),
  ]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join("");
  return { line, area: line + `L${w} ${h}L0 ${h}Z`, points: pts };
}

export async function rpcBatch(fetchFn, url, calls) {
  const body = calls.map((c, i) => ({ jsonrpc: "2.0", id: i + 1, method: c[0], params: c[1] || [] }));
  const r = await fetchFn(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  const arr = Array.isArray(j) ? j : [j];
  const out = new Array(calls.length).fill(undefined);
  for (const e of arr) if (e && e.id >= 1 && e.id <= calls.length && e.result !== undefined) out[e.id - 1] = e.result;
  return out;
}

export async function loadChain(fetchFn, url, n = 8) {
  const [head] = await rpcBatch(fetchFn, url, [["eth_blockNumber"]]);
  const top = hexToNum(head);
  if (!Number.isFinite(top)) throw new Error("no head");
  const nums = Array.from({ length: n }, (_, i) => top - (n - 1 - i));
  const calls = [["eth_gasPrice"], ["eth_chainId"], ...nums.map((b) => ["eth_getBlockByNumber", ["0x" + b.toString(16), false]])];
  const res = await rpcBatch(fetchFn, url, calls);
  const blocks = nums
    .map((num, i) => {
      const b = res[i + 2];
      return b ? { n: num, ts: hexToNum(b.timestamp), tx: Array.isArray(b.transactions) ? b.transactions.length : 0, gasUsed: hexToNum(b.gasUsed) } : null;
    })
    .filter(Boolean);
  const span = blocks.length > 1 ? blocks[blocks.length - 1].ts - blocks[0].ts : NaN;
  const blockTime = blocks.length > 1 && span >= 0 ? span / (blocks.length - 1) : NaN;
  return { block: top, gasWei: hexToNum(res[0]), chainId: hexToNum(res[1]), blocks, blockTime };
}

export async function loadTvl(fetchFn, name) {
  const r = await fetchFn("https://api.llama.fi/v2/historicalChainTvl/" + encodeURIComponent(name));
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error("bad tvl");
  const s = j.filter((p) => p && Number.isFinite(p.tvl) && Number.isFinite(p.date)).slice(-90);
  const last = s.length ? s[s.length - 1].tvl : NaN;
  const prev = s.length > 30 ? s[s.length - 31].tvl : s.length ? s[0].tvl : NaN;
  const change = prev > 0 ? ((last - prev) / prev) * 100 : NaN;
  return { series: s, last, change };
}

export async function loadPairs(fetchFn, dexChain, ca) {
  const q = isAddress(ca) ? ca : dexChain;
  const r = await fetchFn("https://api.dexscreener.com/latest/dex/search?q=" + encodeURIComponent(q));
  const j = await r.json();
  const list = ((j && j.pairs) || []).filter((p) => p && p.chainId === dexChain);
  list.sort((a, b) => ((b.liquidity && b.liquidity.usd) || 0) - ((a.liquidity && a.liquidity.usd) || 0));
  return list.slice(0, 6).map((p) => ({
    id: p.pairAddress,
    base: (p.baseToken && p.baseToken.symbol) || "?",
    quote: (p.quoteToken && p.quoteToken.symbol) || "?",
    dex: [p.dexId, ...(p.labels || [])].filter(Boolean).join(" "),
    price: Number(p.priceUsd),
    change: Number(p.priceChange && p.priceChange.h24),
    liq: Number(p.liquidity && p.liquidity.usd),
    vol: Number(p.volume && p.volume.h24),
    url: typeof p.url === "string" && p.url.startsWith("https://dexscreener.com/") ? p.url : "",
  }));
}

// Self-rescheduling poller. Timer fn is injected (setTimeout in the browser, a fake clock in gates).
export function createPoller(timer, fn, ms) {
  let stopped = false, handle;
  const tick = async () => {
    if (stopped) return;
    try { await fn(); } catch { /* keep polling */ }
    if (!stopped) handle = timer(tick, ms);
  };
  tick();
  return { stop() { stopped = true; if (handle && typeof clearTimeout === "function") clearTimeout(handle); } };
}

// wei (hex string or BigInt) -> "0.0123" ETH, exact via BigInt
export function fmtEth(wei, dp = 4) {
  let n;
  try { n = typeof wei === "bigint" ? wei : BigInt(wei); } catch { return "—"; }
  const base = 10n ** 18n, whole = n / base, frac = (n % base).toString().padStart(18, "0");
  const f = frac.slice(0, dp);
  return whole.toLocaleString("en-US") + (dp ? "." + f : "");
}

export async function loadWallet(fetchFn, url, addr) {
  if (!isAddress(addr)) throw new Error("bad address");
  const [bal, nonce, code] = await rpcBatch(fetchFn, url, [["eth_getBalance", [addr, "latest"]], ["eth_getTransactionCount", [addr, "latest"]], ["eth_getCode", [addr, "latest"]]]);
  if (bal === undefined) throw new Error("rpc");
  return { balance: bal, eth: fmtEth(bal), nonce: hexToNum(nonce), contract: typeof code === "string" && code !== "0x" };
}
