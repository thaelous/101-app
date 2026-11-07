import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  chunk.writeUInt32BE(crc32(typeAndData), 8 + len);
  return chunk;
}

function createPng(width, height, isMaskable = false) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // Scanlines
  const rowStride = width * 4;
  const rawData = Buffer.alloc(height * (1 + rowStride));

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.46;
  const safeRadius = isMaskable ? radius * 0.72 : radius * 0.88;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // No filter
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Default background: dark slate navy #0b1626
      let r = 11, g = 22, b = 38, a = 255;

      // Subtle gradient towards center
      const grad = Math.max(0, 1 - dist / (width * 0.7));
      r = Math.min(255, Math.floor(r + 14 * grad));
      g = Math.min(255, Math.floor(g + 18 * grad));
      b = Math.min(255, Math.floor(b + 32 * grad));

      // Circular emblem boundary
      if (dist < safeRadius) {
        // Inner circle badge: deep purple gradient
        const innerRatio = dist / safeRadius;
        r = Math.floor(45 + (130 - 45) * (1 - innerRatio * 0.8));
        g = Math.floor(18 + (40 - 18) * (1 - innerRatio * 0.8));
        b = Math.floor(80 + (220 - 80) * (1 - innerRatio * 0.8));

        // Golden Book Shape
        // Normalized coordinates in safe zone (-1 to 1)
        const nx = dx / safeRadius;
        const ny = dy / safeRadius;

        // Book pages area: ny between -0.4 and 0.4, nx between -0.6 and 0.6
        if (ny > -0.38 && ny < 0.42 && Math.abs(nx) < 0.65) {
          // Book spine curve
          const spineDist = Math.abs(nx);
          const arch = Math.sin(spineDist * Math.PI * 1.5) * 0.12;
          const bookTop = -0.35 + arch;
          const bookBottom = 0.35 + arch;

          if (ny >= bookTop && ny <= bookBottom) {
            // Gold / Amber pages: #f59e0b / #fbbf24
            const isLeftPage = nx < -0.04;
            const isRightPage = nx > 0.04;

            if (isLeftPage || isRightPage) {
              const highlight = 1 - Math.abs(nx) * 0.5;
              r = Math.floor(245 * highlight);
              g = Math.floor(165 * highlight);
              b = Math.floor(35 * highlight);

              // Subtle page lines
              const lineY = Math.abs((ny - bookTop) * 10) % 1.0;
              if (lineY < 0.15 && Math.abs(nx) > 0.15 && Math.abs(nx) < 0.55) {
                r = Math.floor(r * 0.82);
                g = Math.floor(g * 0.82);
                b = Math.floor(b * 0.82);
              }
            } else {
              // Book spine
              r = 180; g = 110; b = 20;
            }
          }
        }

        // Bookmark ribbon in emerald green (#10b981)
        if (nx > 0.08 && nx < 0.18 && ny > -0.42 && ny < 0.52) {
          const ribbonBottom = 0.52 - Math.abs(nx - 0.13) * 1.2;
          if (ny < ribbonBottom) {
            r = 16; g = 185; b = 129;
          }
        }
      }

      // Outer border ring for normal icon
      if (!isMaskable && dist >= radius * 0.94 && dist <= radius) {
        r = 168; g = 85; b = 247; a = 255; // purple-500 border
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  // Deflate IDAT
  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = makeChunk('IDAT', compressedData);

  // IEND
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate Icons
console.log('Generating PWA Icons...');
fs.writeFileSync(path.join(publicDir, 'pwa-192x192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-512x512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512x512.png'), createPng(512, 512, true));
fs.writeFileSync(path.join(publicDir, 'apple-touch-icon.png'), createPng(180, 180, false));
console.log('PWA PNG Icons generated successfully.');
