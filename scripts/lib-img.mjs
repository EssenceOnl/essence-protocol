// Dependency-free PNG decode/encode (8-bit, all colour types, non-interlaced) + JPEG via jpeg-js.
import { inflateSync, deflateSync } from "node:zlib";
import { readFileSync } from "node:fs";
import jpeg from "jpeg-js";

const CT = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

export function pngInfo(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not png");
  let p = 8; const chunks = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString("latin1", p + 4, p + 8); chunks.push({ type, off: p + 8, len }); p += 12 + len; }
  const h = chunks.find((c) => c.type === "IHDR").off;
  return { width: buf.readUInt32BE(h), height: buf.readUInt32BE(h + 4), bitDepth: buf[h + 8], colorType: buf[h + 9], interlace: buf[h + 12], chunks };
}

export function decodePng(buf) {
  const info = pngInfo(buf);
  if (info.bitDepth !== 8 || info.interlace) throw new Error("unsupported png variant");
  const ch = CT[info.colorType];
  const idat = Buffer.concat(info.chunks.filter((c) => c.type === "IDAT").map((c) => buf.subarray(c.off, c.off + c.len)));
  const raw = inflateSync(idat), { width: w, height: h } = info, stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let pl = info.chunks.find((c) => c.type === "PLTE");
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = y * (stride + 1) + 1, dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0, b = y ? out[dst - stride + x] : 0, c = x >= ch && y ? out[dst - stride + x - ch] : 0;
      let v = raw[src + x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[dst + x] = v & 255;
    }
  }
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255; const o = i * ch;
    if (info.colorType === 6) { r = out[o]; g = out[o + 1]; b = out[o + 2]; a = out[o + 3]; }
    else if (info.colorType === 2) { r = out[o]; g = out[o + 1]; b = out[o + 2]; }
    else if (info.colorType === 0) { r = g = b = out[o]; }
    else if (info.colorType === 4) { r = g = b = out[o]; a = out[o + 1]; }
    else { const k = out[o] * 3; r = buf[pl.off + k]; g = buf[pl.off + k + 1]; b = buf[pl.off + k + 2]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { width: w, height: h, data: rgba, info };
}

export function decodeJpeg(buf) { const j = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true }); return { width: j.width, height: j.height, data: Buffer.from(j.data) }; }

const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const t = Buffer.from(type, "latin1"), l = Buffer.alloc(4), c = Buffer.alloc(4); l.writeUInt32BE(data.length); c.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, c]); };
export function encodePng({ width: w, height: h, data }) {
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; data.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Premultiplied box-filter resize: colour is weighted by alpha so transparent pixels (often stored as black) never bleed in.
export function resizePremul(img, nw, nh) {
  const { width: w, height: h, data } = img, out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const x0 = (x * w) / nw, x1 = ((x + 1) * w) / nw, y0 = (y * h) / nh, y1 = ((y + 1) * h) / nh;
    let r = 0, g = 0, b = 0, a = 0, wt = 0;
    for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
      const cw = (Math.min(xx + 1, x1) - Math.max(xx, x0)) * (Math.min(yy + 1, y1) - Math.max(yy, y0));
      const i = (yy * w + xx) * 4, al = data[i + 3] / 255;
      r += data[i] * al * cw; g += data[i + 1] * al * cw; b += data[i + 2] * al * cw; a += al * cw; wt += cw;
    }
    const o = (y * nw + x) * 4;
    if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
    out[o + 3] = Math.round((a / wt) * 255);
  }
  return { width: nw, height: nh, data: out };
}

export const load = (p) => { const b = readFileSync(p); return b[0] === 0x89 ? decodePng(b) : decodeJpeg(b); };
