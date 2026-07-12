const sharp = require('sharp');

const SRC = '/Users/chenying/Desktop/图片信息.png';

async function main() {
  const meta = await sharp(SRC).metadata();
  const W = meta.width, H = meta.height;

  // Remove watermark region (bottom-right) same as generation
  const cropRight = Math.round(W * 0.07);
  const cropBottom = Math.round(H * 0.08);
  const rw = W - cropRight;   // 1905
  const rh = H - cropBottom;  // 1884

  // Downscale the watermark-free region and read raw pixels
  const N = 256;
  const sx = N / rw, sy = N / rh;
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
      const r = data[i], g = data[i + 1], b = data[i + 2];
      // white text: all channels bright; gradient bg has at least one channel < 200
      if (r > 200 && g > 200 && b > 200) {
        sumX += x; sumY += y; n++;
      }
    }
  }
  const cxN = sumX / n, cyN = sumY / n;
  // map back to 1024 output space (region -> 1024 fill)
  const scale = 1024 / N;
  const cx1024 = cxN * scale;
  const cy1024 = cyN * scale;

  console.log(`WxH=${W}x${H}, region=${rw}x${rh}`);
  console.log(`bright(text) pixels: ${n}`);
  console.log(`text centroid in 256-space: (${cxN.toFixed(1)}, ${cyN.toFixed(1)})`);
  console.log(`text centroid in 1024-output-space: (${cx1024.toFixed(1)}, ${cy1024.toFixed(1)})`);
  console.log(`ideal center = (512, 512)`);
  console.log(`=> current offset from center: dx=${(cx1024-512).toFixed(1)}px, dy=${(cy1024-512).toFixed(1)}px (in 1024 space)`);
  console.log(`=> in 180px icon that is: dx=${((cx1024-512)*180/1024).toFixed(2)}px, dy=${((cy1024-512)*180/1024).toFixed(2)}px`);
}

main().catch(e => { console.error(e); process.exit(1); });
