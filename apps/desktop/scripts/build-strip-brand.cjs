// Extract exact monochrome artwork from the original brand sheet. No tracing,
// generated lettering, or replacement font is used. Keep the source untouched.
const { app, nativeImage } = require('electron');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');

app.whenReady().then(() => {
  try {
    const source = nativeImage.createFromBuffer(
      readFileSync(
        path.resolve(
          __dirname,
          '../../../packages/shared/assets/vyora-brand-reference.png',
        ),
      ),
    );
    if (source.isEmpty())
      throw new Error('VYORA brand sheet could not be decoded.');
    const wordmark = source
      .crop({ x: 379, y: 744, width: 226, height: 65 })
      .toDataURL();
    const symbol = source
      .crop({ x: 409, y: 588, width: 191, height: 157 })
      .toDataURL();
    const output =
      JSON.stringify(
        {
          source: 'packages/shared/assets/vyora-brand-reference.png',
          crops: {
            wordmark: [379, 744, 226, 65],
            symbol: [409, 588, 191, 157],
          },
          wordmark,
          symbol,
        },
        null,
        2,
      ) + '\n';
    writeFileSync(path.resolve(__dirname, '../src/strip-brand.json'), output);
    console.log(
      'Strip brand assets extracted from the original monochrome artwork.',
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
