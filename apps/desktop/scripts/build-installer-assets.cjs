// Format existing approved artwork for NSIS. No new art or image dependency.
const { app, nativeImage } = require('electron');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.setPath(
  'userData',
  path.resolve(__dirname, '../out/installer-assets/profile'),
);
app.disableHardwareAcceleration();

function bitmap(width, height, background, icon, left, top) {
  const stride = Math.ceil((width * 3) / 4) * 4;
  const bytes = Buffer.alloc(54 + stride * height);
  bytes.write('BM');
  bytes.writeUInt32LE(bytes.length, 2);
  bytes.writeUInt32LE(54, 10);
  bytes.writeUInt32LE(40, 14);
  bytes.writeInt32LE(width, 18);
  bytes.writeInt32LE(height, 22);
  bytes.writeUInt16LE(1, 26);
  bytes.writeUInt16LE(24, 28);
  const size = icon.getSize();
  const pixels = icon.toBitmap();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = 54 + (height - 1 - y) * stride + x * 3;
      const ix = x - left,
        iy = y - top;
      const inside = ix >= 0 && iy >= 0 && ix < size.width && iy < size.height;
      const source = (iy * size.width + ix) * 4;
      const alpha = inside ? pixels[source + 3] / 255 : 0;
      for (let channel = 0; channel < 3; channel++) {
        bytes[offset + channel] = Math.round(
          background[2 - channel] * (1 - alpha) +
            (inside ? pixels[source + channel] : 0) * alpha,
        );
      }
    }
  }
  return bytes;
}

app.whenReady().then(() => {
  try {
    const root = path.resolve(__dirname, '..');
    const directory = path.join(root, 'out/installer-assets');
    mkdirSync(directory, { recursive: true });
    const icon = nativeImage.createFromPath(
      path.join(root, 'assets/vyora-icon.png'),
    );
    if (icon.isEmpty()) throw new Error('Could not read the VYORA icon');
    writeFileSync(
      path.join(directory, 'sidebar.bmp'),
      bitmap(
        164,
        314,
        [28, 22, 40],
        icon.resize({ width: 142, height: 142, quality: 'best' }),
        11,
        78,
      ),
    );
    writeFileSync(
      path.join(directory, 'header.bmp'),
      bitmap(
        150,
        57,
        [255, 255, 255],
        icon.resize({ width: 49, height: 49, quality: 'best' }),
        97,
        4,
      ),
    );
    console.log('VYORA installer artwork ready.');
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
