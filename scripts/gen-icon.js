const sharp = require('sharp');
const path = require('path');

const SRC = '/Users/chenying/Desktop/图片信息.png';
const OUT = '/Users/chenying/anime-coze';

async function main() {
  const meta = await sharp(SRC).metadata();
  const W = meta.width, H = meta.height;
  console.log(`Source: ${W}x${H} ${meta.format}`);

  // 1) Remove watermark region (bottom-right)
  const cropRight = Math.round(W * 0.07);
  const cropBottom = Math.round(H * 0.08);
  const rw = W - cropRight;   // 1905
  const rh = H - cropBottom;  // 1884

  // 2) Measure "追番" text centroid (white text) on a 256x256 downscale
  const N = 256;
  const { data, info } = await sharp(SRC)
    .extract({ left: 0, top: 0, width: rw, height: rh })
    .resize(N, N, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let sumX = 0, sumY = 0, n = 0;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * ch;
      if (data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200) { sumX += x; sumY += y; n++; }
    }
  }
  const cxR = (sumX / n) * (rw / N);   // centroid in region(source) coords
  const cyR = (sumY / n) * (rh / N);

  // 3) Crop a square centered on the text centroid (clamped so watermark stays outside)
  const side = 1650;
  const left = Math.max(0, Math.min(Math.round(cxR - side / 2), rw - side));
  const top  = Math.max(0, Math.min(Math.round(cyR - side / 2), rh - side));
  console.log(`text centroid(region)=(${cxR.toFixed(0)}, ${cyR.toFixed(0)}); crop window=(${left}, ${top}, ${side}x${side})`);

  const base = sharp(SRC)
    .extract({ left, top, width: side, height: side })
    .resize(1024, 1024, { fit: 'fill' });

  const sizes = [
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'favicon.png', size: 64 },
  ];
  for (const s of sizes) {
    await base.clone().resize(s.size, s.size, { fit: 'fill' }).png({ quality: 90 }).toFile(path.join(OUT, s.name));
    console.log(`✓ ${s.name} (${s.size}px)`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
