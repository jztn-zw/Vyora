// Format the approved transparent PNG as a multi-resolution Windows icon.
// Run with Electron so no image-processing package needs to be installed.
const { app, nativeImage } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  try {
    const directory = path.resolve(__dirname, '../assets');
    const source = nativeImage.createFromBuffer(
      readFileSync(path.join(directory, 'vyora-icon.png')),
    );
    if (source.isEmpty())
      throw new Error('The approved icon PNG could not be decoded.');
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const images = sizes.map((size) =>
      source.resize({ width: size, height: size, quality: 'best' }).toPNG(),
    );
    const header = Buffer.alloc(6 + images.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);
    let offset = header.length;
    sizes.forEach((size, index) => {
      const entry = 6 + index * 16;
      header.writeUInt8(size === 256 ? 0 : size, entry);
      header.writeUInt8(size === 256 ? 0 : size, entry + 1);
      header.writeUInt16LE(1, entry + 4);
      header.writeUInt16LE(32, entry + 6);
      header.writeUInt32LE(images[index].length, entry + 8);
      header.writeUInt32LE(offset, entry + 12);
      offset += images[index].length;
    });
    writeFileSync(
      path.join(directory, 'vyora.ico'),
      Buffer.concat([header, ...images]),
    );
    console.log(`Windows icon ready: ${sizes.join(', ')} px.`);
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
