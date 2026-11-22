'use strict';
/**
 * Pretend to be Instagram: send a fake "Reel shared in DM" event to your n8n workflow.
 *
 * Safe by default: it refuses to run unless DRY_RUN=true in .env, so nothing gets
 * published to Instagram. Use --live to really publish the test clip (not recommended).
 *
 * Run:  docker compose exec ffmpeg-api node tools/send-test-dm.js [optional-video-url]
 */
const fs = require('fs');
const path = require('path');
const { run, OUTPUT_DIR } = require('../render');

const args = process.argv.slice(2);
const live = args.includes('--live');
const customUrl = args.find((a) => /^https?:\/\//i.test(a));

const senderId = process.env.ALLOWED_SENDER_IG_ID || '';
const igId = process.env.IG_BUSINESS_ACCOUNT_ID || '1784000000000000';
const dryRun = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
const webhookUrl = process.env.N8N_INTERNAL_WEBHOOK || 'http://n8n:5678/webhook/ig-dm';

(async () => {
  if (!senderId) {
    throw new Error('ALLOWED_SENDER_IG_ID is empty in .env. Fill it in (see README step 9) and run setup again.');
  }
  if (!dryRun && !live) {
    throw new Error(
      'DRY_RUN is not "true" in .env, so this test would REALLY post to Instagram.\n' +
        '  Set DRY_RUN=true in .env and run setup again, or add --live if you really want to publish.'
    );
  }

  let mediaUrl = customUrl;
  if (!mediaUrl) {
    const sample = path.join(OUTPUT_DIR, 'sample-source.mp4');
    if (!fs.existsSync(sample)) {
      console.log('Creating a sample test video...');
      await run('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
        '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sample,
      ]);
    }
    mediaUrl = 'http://ffmpeg-api:8080/files/sample-source.mp4';
  }

  const now = Date.now();
  const payload = {
    object: 'instagram',
    entry: [
      {
        id: igId,
        time: now,
        messaging: [
          {
            sender: { id: senderId },
            recipient: { id: igId },
            timestamp: now,
            message: {
              mid: `test_${now}`,
              attachments: [
                {
                  type: 'ig_reel',
                  payload: {
                    url: mediaUrl,
                    title: 'Morning routine that changed my life 🌅 Wake up at 5am, cold shower, journal. Credit @example_creator',
                    reel_video_id: `test${now}`,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `n8n answered HTTP ${res.status}: ${text.slice(0, 300)}\n` +
        '  Is the workflow switched to Active / Published in n8n? (README step 7)'
    );
  }
  console.log('\nTest message delivered to n8n.');
  console.log(dryRun ? 'Mode: DRY RUN (nothing will be posted to Instagram).' : 'Mode: LIVE (this WILL post).');
  console.log('\nNow open http://localhost:5678 -> your workflow -> "Executions" tab and click the newest run.');
  console.log('After ~1 minute, the "Dry Run Complete" step shows the caption and a preview link.\n');
})().catch((err) => {
  console.error(`\nTEST FAILED: ${err.message}\n`);
  process.exit(1);
});
