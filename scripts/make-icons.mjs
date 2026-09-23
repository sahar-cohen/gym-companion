// Generates the PWA icons (PNG) and favicon (SVG) into public/icons.
// Glyph: a simple dumbbell on the accent colour. Run: npm run icons
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const ACCENT = [0xff, 0x4f, 0x1f];
const WHITE = [0xff, 0xff, 0xff];
const out = new URL('../public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Shapes in unit space [0,1]. Rounded rects: [x, y, w, h, r].
function glyph(scale) {
  const c = 0.5, s = scale;
  return [
    [c - 0.2 * s, c - 0.035 * s, 0.4 * s, 0.07 * s, 0.035 * s], // bar
    [c - 0.3 * s, c - 0.17 * s, 0.1 * s, 0.34 * s, 0.035 * s], // plates
    [c + 0.2 * s, c - 0.17 * s, 0.1 * s, 0.34 * s, 0.035 * s],
    [c - 0.36 * s, c - 0.1 * s, 0.07 * s, 0.2 * s, 0.03 * s],
    [c + 0.29 * s, c - 0.1 * s, 0.07 * s, 0.2 * s, 0.03 * s],
  ];
}
const inRRect = (x, y, [rx, ry, w, h, r]) => {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const dx = Math.max(rx + r - x, 0, x - (rx + w - r));
  const dy = Math.max(ry + r - y, 0, y - (ry + h - r));
  return dx * dx + dy * dy <= r * r;
};

function render(size, { bgRadius, glyphScale }) {
  const buf = Buffer.alloc(size * size * 4);
  const shapes = glyph(glyphScale);
  const bg = [0, 0, 1, 1, bgRadius];
  const SS = 4;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let a = 0, w = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      const x = (px + (sx + 0.5) / SS) / size, y = (py + (sy + 0.5) / SS) / size;
      if (!inRRect(x, y, bg)) continue;
      a++;
      if (shapes.some((sh) => inRRect(x, y, sh))) w++;
    }
    const n = SS * SS, i = (py * size + px) * 4;
    const t = a ? w / a : 0;
    for (let k = 0; k < 3; k++) buf[i + k] = Math.round(ACCENT[k] * (1 - t) + WHITE[k] * t);
    buf[i + 3] = Math.round((a / n) * 255);
  }
  return png(size, buf);
}

writeFileSync(new URL('icon-192.png', out), render(192, { bgRadius: 0.22, glyphScale: 1 }));
writeFileSync(new URL('icon-512.png', out), render(512, { bgRadius: 0.22, glyphScale: 1 }));
writeFileSync(new URL('icon-maskable-512.png', out), render(512, { bgRadius: 0, glyphScale: 0.72 }));
writeFileSync(new URL('apple-touch-icon.png', out), render(180, { bgRadius: 0, glyphScale: 0.85 }));
writeFileSync(new URL('favicon.svg', out), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#FF4F1F"/><g fill="#fff">${glyph(1).map(([x, y, w, h, r]) => `<rect x="${x * 100}" y="${y * 100}" width="${w * 100}" height="${h * 100}" rx="${r * 100}"/>`).join('')}</g></svg>`);
console.log('icons written');
