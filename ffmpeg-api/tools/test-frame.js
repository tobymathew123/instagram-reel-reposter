'use strict';
/**
 * Preview your Canva frame without touching Instagram.
 *
 * Generates two short test clips (one landscape, one vertical), puts your frame on top,
 * and prints links you can open in your browser.
 *
 * Run:  docker compose exec ffmpeg-api node tools/test-frame.js
 */
const path = require('path');
const { render, run, OUTPUT_DIR } = require('../render');

async function makeSample(name, size) {
  const file = path.join(OUTPUT_DIR, `${name}.mp4`);
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30`,
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-t', '8',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
    file,
  ]);
  return file;
}

(async () => {
  const frame = process.env.CANVA_FRAME_PNG_URL || 'local';
  console.log(`\nUsing frame: ${frame === 'local' ? 'branding/frame.png' : frame}\n`);

  const wide = await makeSample('sample-source', '1280x720');
  const tall = await makeSample('sample-source-vertical', '1080x1920');

  const a = await render({ sourceFile: wide, frame, outputName: 'sample-branded-landscape' });
  const b = await render({ sourceFile: tall, frame, outputName: 'sample-branded-vertical' });

  console.log('Done! Open these links in your web browser to see how your frame looks:\n');
  console.log(`  Landscape video:  http://localhost:8080/files/${a.filename}`);
  console.log(`  Vertical video:   http://localhost:8080/files/${b.filename}\n`);
})().catch((err) => {
  console.error(`\nTEST FAILED: ${err.message}\n`);
  process.exit(1);
});
