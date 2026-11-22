#!/usr/bin/env node
'use strict';
/**
 * DEVELOPER FILE - the client never needs to run this.
 *
 * Generates workflows/ig_reel_reposter.json (the importable n8n workflow).
 * Edit the workflow here, then run:   node dev/build-workflow.js
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const uid = (seed) => {
  // deterministic UUIDs so re-generating doesn't create noisy diffs
  const h = crypto.createHash('sha1').update(seed).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};

const CFG = "$('Config').first().json";
const GRAPH = `https://graph.facebook.com/{{ ${CFG}.GRAPH_API_VERSION }}`;

const nodes = [];
const connections = {};
function node(name, type, typeVersion, position, parameters, extra = {}) {
  nodes.push({ parameters, id: uid(name), name, type, typeVersion, position, ...extra });
  return name;
}
function connect(from, to, outputIndex = 0) {
  connections[from] = connections[from] || { main: [] };
  while (connections[from].main.length <= outputIndex) connections[from].main.push([]);
  connections[from].main[outputIndex].push({ node: to, type: 'main', index: 0 });
}
function cond(id, leftValue, operator, rightValue = '') {
  const c = { id: uid(id), leftValue, rightValue, operator };
  return c;
}
function ifParams(conditions, combinator = 'and') {
  return {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' },
      conditions,
      combinator,
    },
    options: {},
  };
}
const OP = {
  strEq: { type: 'string', operation: 'equals' },
  strNotEmpty: { type: 'string', operation: 'notEmpty', singleValue: true },
  isTrue: { type: 'boolean', operation: 'true', singleValue: true },
  numGte: { type: 'number', operation: 'gte' },
};
const httpOpts = (timeout = 30000) => ({ timeout });

// ------------------------------------------------------------------ sticky notes
node('Note: Overview', 'n8n-nodes-base.stickyNote', 1, [-440, -380], {
  width: 620,
  height: 300,
  content:
    '## Instagram Reel Auto-Reposter\n' +
    '**How it works:** you share a Reel by DM from your personal account (A) to your channel (B). ' +
    'This workflow checks it came from you, adds your Canva frame, writes an AI caption, and posts it on B.\n\n' +
    '**Settings live in the `.env` file** on your computer (read by the **Config** node). ' +
    'Change `.env`, then run the setup script again.\n\n' +
    '**Test mode:** `DRY_RUN=true` in `.env` = nothing is posted.\n\n' +
    'See README.md for full instructions.',
}, {});
node('Note: Verification', 'n8n-nodes-base.stickyNote', 1, [-440, -60], {
  width: 620, height: 340, color: 5,
  content: '### Part 1 - Meta handshake\nMeta calls this once (GET) when you click **Verify and save** in the Meta app webhook settings.',
}, {});
node('Note: Publish loop', 'n8n-nodes-base.stickyNote', 1, [1500, 300], {
  width: 900, height: 360, color: 4,
  content: '### Part 3 - Publish\nInstagram needs time to process the video. We check its status every 15 seconds (up to 10 minutes) and publish as soon as it is ready.',
}, {});

// ------------------------------------------------------------------ Part 1: GET verification
node('Meta Verify (GET)', 'n8n-nodes-base.webhook', 2, [-400, 60], {
  httpMethod: 'GET', path: 'ig-dm', responseMode: 'responseNode', options: {},
}, { webhookId: uid('webhook-get') });

node('Is Valid Verification?', 'n8n-nodes-base.if', 2, [-180, 60], ifParams([
  cond('v1', "={{ $json.query['hub.mode'] }}", OP.strEq, 'subscribe'),
  cond('v2', "={{ $json.query['hub.verify_token'] }}", OP.strEq, '={{ $env.META_VERIFY_TOKEN }}'),
  cond('v3', '={{ $env.META_VERIFY_TOKEN }}', OP.strNotEmpty),
]));

node('Return Challenge', 'n8n-nodes-base.respondToWebhook', 1.1, [40, -20], {
  respondWith: 'text', responseBody: "={{ $json.query['hub.challenge'] }}", options: { responseCode: 200 },
});
node('Reject Verification', 'n8n-nodes-base.respondToWebhook', 1.1, [40, 160], {
  respondWith: 'text', responseBody: 'Verification failed: verify token does not match', options: { responseCode: 403 },
});
connect('Meta Verify (GET)', 'Is Valid Verification?');
connect('Is Valid Verification?', 'Return Challenge', 0);
connect('Is Valid Verification?', 'Reject Verification', 1);

// ------------------------------------------------------------------ Part 2: POST DM events
node('Instagram DM (POST)', 'n8n-nodes-base.webhook', 2, [-400, 440], {
  httpMethod: 'POST', path: 'ig-dm', responseMode: 'onReceived', options: {},
}, { webhookId: uid('webhook-post') });

const cfgFields = [
  ['META_PAGE_ACCESS_TOKEN', '={{ $env.META_PAGE_ACCESS_TOKEN }}'],
  ['IG_BUSINESS_ACCOUNT_ID', '={{ $env.IG_BUSINESS_ACCOUNT_ID }}'],
  ['ALLOWED_SENDER_IG_ID', '={{ ($env.ALLOWED_SENDER_IG_ID || "").trim() }}'],
  ['GRAPH_API_VERSION', '={{ $env.GRAPH_API_VERSION || "v22.0" }}'],
  ['CANVA_FRAME_PNG_URL', '={{ $env.CANVA_FRAME_PNG_URL || "local" }}'],
  ['FFMPEG_API_URL', '={{ $env.FFMPEG_API_URL || "http://ffmpeg-api:8080" }}'],
  ['FFMPEG_API_KEY', '={{ $env.FFMPEG_API_KEY || "" }}'],
  ['GEMINI_API_KEY', '={{ $env.GEMINI_API_KEY || "" }}'],
  ['GEMINI_MODEL', '={{ $env.GEMINI_MODEL || "gemini-2.5-flash" }}'],
  ['CHANNEL_NICHE', '={{ $env.CHANNEL_NICHE || "viral, entertaining short videos" }}'],
  ['CAPTION_FOOTER', '={{ $env.CAPTION_FOOTER || "" }}'],
  ['FALLBACK_HASHTAGS', '={{ $env.FALLBACK_HASHTAGS || "#reels #viral #explore #trending #fyp" }}'],
];
const cfgBools = [
  ['SEND_DM_CONFIRMATIONS', '={{ String($env.SEND_DM_CONFIRMATIONS || "true").toLowerCase() === "true" }}'],
  ['DRY_RUN', '={{ String($env.DRY_RUN || "false").toLowerCase() === "true" }}'],
];
node('Config', 'n8n-nodes-base.set', 3.4, [-180, 440], {
  mode: 'manual',
  assignments: {
    assignments: [
      ...cfgFields.map(([name, value]) => ({ id: uid(`cfg-${name}`), name, value, type: 'string' })),
      ...cfgBools.map(([name, value]) => ({ id: uid(`cfg-${name}`), name, value, type: 'boolean' })),
    ],
  },
  includeOtherFields: false,
  options: {},
});
connect('Instagram DM (POST)', 'Config');

node('Parse DM Event', 'n8n-nodes-base.code', 2, [40, 440], {
  jsCode: `// Turns Meta's webhook payload into one simple item per DM.
// Look at this node's OUTPUT to find your ALLOWED_SENDER_IG_ID (the "senderId" field).
const cfg = $('Config').first().json;
const body = $('Instagram DM (POST)').first().json.body || {};
const VIDEO_TYPES = ['ig_reel', 'ig_post', 'video', 'reel'];

// Remember processed message IDs so Meta retries never cause double posts
const memory = $getWorkflowStaticData('global');
memory.seen = memory.seen || [];

const out = [];
for (const entry of body.entry || []) {
  for (const ev of entry.messaging || []) {
    const msg = ev.message || {};
    const atts = msg.attachments || [];
    const att = atts.find(a => VIDEO_TYPES.includes(a.type)) || atts[0] || {};
    const p = att.payload || {};
    const mid = msg.mid || '';
    const duplicate = !!mid && memory.seen.includes(mid);
    out.push({ json: {
      senderId: String((ev.sender && ev.sender.id) || ''),
      allowedSenderId: cfg.ALLOWED_SENDER_IG_ID,
      senderIsAllowed: !!cfg.ALLOWED_SENDER_IG_ID && String((ev.sender && ev.sender.id) || '') === cfg.ALLOWED_SENDER_IG_ID,
      attachmentType: att.type || 'none',
      mediaUrl: p.url || '',
      reelTitle: p.title || '',
      reelVideoId: p.reel_video_id || '',
      text: msg.text || '',
      messageId: mid,
      isEcho: !!msg.is_echo,
      duplicate,
      receivedAt: new Date(ev.timestamp || Date.now()).toISOString(),
    }});
  }
}

// Only mark as "seen" the messages we will actually process
for (const item of out) {
  const j = item.json;
  if (j.senderIsAllowed && j.mediaUrl && !j.isEcho && !j.duplicate && j.messageId) memory.seen.push(j.messageId);
}
memory.seen = memory.seen.slice(-300);

if (!out.length) out.push({ json: { senderId: '', attachmentType: 'none', mediaUrl: '', note: 'Not a DM event (read receipt, reaction, etc.) - ignored.' } });
return out;`,
});
connect('Config', 'Parse DM Event');

node('Allowed Sender & Reel?', 'n8n-nodes-base.if', 2, [260, 440], ifParams([
  cond('f1', '={{ $json.senderId }}', OP.strEq, "={{ $('Config').first().json.ALLOWED_SENDER_IG_ID || '__not_set__' }}"),
  cond('f2', "={{ ['ig_reel', 'ig_post', 'video', 'reel'].includes($json.attachmentType) }}", OP.isTrue),
  cond('f3', '={{ $json.mediaUrl }}', OP.strNotEmpty),
  cond('f4', '={{ !$json.isEcho && !$json.duplicate }}', OP.isTrue),
]));
connect('Parse DM Event', 'Allowed Sender & Reel?');

node('Ignore (not from you / not a Reel)', 'n8n-nodes-base.noOp', 1, [480, 620], {});
connect('Allowed Sender & Reel?', 'Ignore (not from you / not a Reel)', 1);

node('Prepare Job', 'n8n-nodes-base.code', 2, [480, 340], {
  mode: 'runOnceForEachItem',
  jsCode: `// Builds the AI prompt and a unique job id for this Reel.
const cfg = $('Config').first().json;
const job = $json;
const jobId = 'reel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
const context = (job.reelTitle || job.text || '').slice(0, 1500);

const prompt = [
  'You are the social media copywriter for an Instagram channel.',
  'Channel niche: ' + cfg.CHANNEL_NICHE,
  '',
  'We are reposting a Reel. Its original description (may be empty, messy, or in another language) is:',
  '"""' + (context || '(no description available)') + '"""',
  '',
  'Write a brand-new English caption following these rules exactly:',
  '- Line 1: a punchy, scroll-stopping hook (max 12 words).',
  '- Line 2: one short, engaging follow-up sentence or call to action.',
  '- Then one empty line.',
  '- Then exactly 5 relevant, niche-specific hashtags on one line, separated by single spaces.',
  "- If the original description mentions the creator's @username, add a final line: Credit: @username",
  '- Plain text only. No markdown, no asterisks, no quotation marks, no labels like "Hook:", max 2 emojis.',
  '- Output only the caption, nothing else.',
].join('\\n');

return { json: {
  ...job,
  jobId,
  geminiRequest: {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.9, maxOutputTokens: 400, thinkingConfig: { thinkingBudget: 0 } },
  },
}};`,
});
connect('Allowed Sender & Reel?', 'Prepare Job', 0);

node('Generate Caption (Gemini)', 'n8n-nodes-base.httpRequest', 4.2, [700, 340], {
  method: 'POST',
  url: `=https://generativelanguage.googleapis.com/v1beta/models/{{ ${CFG}.GEMINI_MODEL }}:generateContent`,
  sendHeaders: true,
  headerParameters: { parameters: [{ name: 'x-goog-api-key', value: `={{ ${CFG}.GEMINI_API_KEY }}` }] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody: '={{ JSON.stringify($json.geminiRequest) }}',
  options: httpOpts(60000),
}, { retryOnFail: true, maxTries: 2, waitBetweenTries: 3000, onError: 'continueRegularOutput' });
connect('Prepare Job', 'Generate Caption (Gemini)');

node('Build Caption', 'n8n-nodes-base.code', 2, [920, 340], {
  mode: 'runOnceForEachItem',
  jsCode: `// Cleans the AI caption. If the AI failed, builds a simple fallback caption so posting still works.
const cfg = $('Config').first().json;
const job = $('Prepare Job').item.json;

let text = '';
const parts = ($json.candidates && $json.candidates[0] && $json.candidates[0].content && $json.candidates[0].content.parts) || [];
text = parts.map(p => p.text || '').join('').trim();

// strip markdown the model might add (but keep #hashtags)
text = text
  .replace(/\\*\\*|__|\`/g, '')
  .replace(/^#{1,6}\\s+/gm, '')
  .replace(/^(hook|caption|line \\d)\\s*:\\s*/gim, '')
  .replace(/^["'\\u201c\\u201d]+|["'\\u201c\\u201d]+$/g, '')
  .split('\\n').map(l => l.trim()).join('\\n')
  .replace(/\\n{3,}/g, '\\n\\n')
  .trim();

const aiGenerated = text.length > 0;
if (!aiGenerated) {
  const firstLine = (job.reelTitle || '').split('\\n')[0].replace(/#[^\\s#]+/g, '').trim().slice(0, 150);
  text = (firstLine || 'You need to see this \\u{1F440}') + '\\n\\n' + cfg.FALLBACK_HASHTAGS;
}
if (cfg.CAPTION_FOOTER) text += '\\n\\n' + cfg.CAPTION_FOOTER;

// Instagram limits: max 30 hashtags, max 2200 characters
let tagCount = 0;
text = text.replace(/#[^\\s#]+/g, t => (++tagCount <= 30 ? t : '')).replace(/[ \\t]+\\n/g, '\\n');
text = text.slice(0, 2200).trim();

return { json: {
  caption: text,
  aiGenerated,
  aiError: aiGenerated ? null : ($json.error ? (typeof $json.error === 'string' ? $json.error : ($json.error.message || JSON.stringify($json.error))) : 'Empty AI response'),
}};`,
});
connect('Generate Caption (Gemini)', 'Build Caption');

node('Render Branded Video (FFmpeg)', 'n8n-nodes-base.httpRequest', 4.2, [1140, 340], {
  method: 'POST',
  url: `={{ ${CFG}.FFMPEG_API_URL }}/render`,
  sendHeaders: true,
  headerParameters: { parameters: [{ name: 'x-api-key', value: `={{ ${CFG}.FFMPEG_API_KEY }}` }] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody:
    `={{ JSON.stringify({ source: $('Prepare Job').item.json.mediaUrl, frame: ${CFG}.CANVA_FRAME_PNG_URL, jobId: $('Prepare Job').item.json.jobId }) }}`,
  options: httpOpts(900000),
}, { retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueErrorOutput' });
connect('Build Caption', 'Render Branded Video (FFmpeg)');

node('Dry Run?', 'n8n-nodes-base.if', 2, [1360, 240], ifParams([
  cond('d1', `={{ ${CFG}.DRY_RUN }}`, OP.isTrue),
]));
connect('Render Branded Video (FFmpeg)', 'Dry Run?', 0);

node('Dry Run Complete', 'n8n-nodes-base.set', 3.4, [1580, 100], {
  mode: 'manual',
  assignments: {
    assignments: [
      { id: uid('dr1'), name: 'result', value: 'DRY RUN - nothing was posted. Set DRY_RUN=false in .env to go live.', type: 'string' },
      { id: uid('dr2'), name: 'previewOnThisComputer', value: "=http://localhost:8080/files/{{ $json.filename }}", type: 'string' },
      { id: uid('dr3'), name: 'publicVideoUrl', value: '={{ $json.url }}', type: 'string' },
      { id: uid('dr4'), name: 'caption', value: "={{ $('Build Caption').item.json.caption }}", type: 'string' },
      { id: uid('dr5'), name: 'aiGenerated', value: "={{ $('Build Caption').item.json.aiGenerated }}", type: 'boolean' },
    ],
  },
  includeOtherFields: false,
  options: {},
});
connect('Dry Run?', 'Dry Run Complete', 0);

// ------------------------------------------------------------------ Part 3: publish
const tokenQuery = { name: 'access_token', value: `={{ ${CFG}.META_PAGE_ACCESS_TOKEN }}` };

node('Create Media Container', 'n8n-nodes-base.httpRequest', 4.2, [1580, 400], {
  method: 'POST',
  url: `=${GRAPH}/{{ ${CFG}.IG_BUSINESS_ACCOUNT_ID }}/media`,
  sendBody: true,
  contentType: 'form-urlencoded',
  bodyParameters: {
    parameters: [
      { name: 'media_type', value: 'REELS' },
      { name: 'video_url', value: "={{ $('Render Branded Video (FFmpeg)').item.json.url }}" },
      { name: 'caption', value: "={{ $('Build Caption').item.json.caption }}" },
      { name: 'share_to_feed', value: 'true' },
      tokenQuery,
    ],
  },
  options: httpOpts(60000),
}, { retryOnFail: true, maxTries: 2, waitBetweenTries: 5000, onError: 'continueErrorOutput' });
connect('Dry Run?', 'Create Media Container', 1);

node('Wait 15s', 'n8n-nodes-base.wait', 1.1, [1800, 400], { amount: 15, unit: 'seconds' }, { webhookId: uid('wait-15') });
connect('Create Media Container', 'Wait 15s', 0);

node('Check Container Status', 'n8n-nodes-base.httpRequest', 4.2, [2020, 400], {
  method: 'GET',
  url: `=${GRAPH}/{{ $('Create Media Container').item.json.id }}`,
  sendQuery: true,
  queryParameters: { parameters: [{ name: 'fields', value: 'status_code,status' }, tokenQuery] },
  options: httpOpts(30000),
}, { retryOnFail: true, maxTries: 3, waitBetweenTries: 5000, onError: 'continueErrorOutput' });
connect('Wait 15s', 'Check Container Status');

node('Ready to Publish?', 'n8n-nodes-base.if', 2, [2240, 400], ifParams([
  cond('r1', '={{ $json.status_code }}', OP.strEq, 'FINISHED'),
]));
connect('Check Container Status', 'Ready to Publish?', 0);

node('Failed or Timed Out?', 'n8n-nodes-base.if', 2, [2240, 560], ifParams([
  cond('t1', "={{ ['ERROR', 'EXPIRED'].includes($json.status_code) }}", OP.isTrue),
  cond('t2', '={{ $runIndex }}', OP.numGte, 40),
], 'or'));
connect('Ready to Publish?', 'Failed or Timed Out?', 1);
connect('Failed or Timed Out?', 'Wait 15s', 1); // still processing -> check again

node('Publish Reel', 'n8n-nodes-base.httpRequest', 4.2, [2460, 300], {
  method: 'POST',
  url: `=${GRAPH}/{{ ${CFG}.IG_BUSINESS_ACCOUNT_ID }}/media_publish`,
  sendBody: true,
  contentType: 'form-urlencoded',
  bodyParameters: {
    parameters: [{ name: 'creation_id', value: "={{ $('Create Media Container').item.json.id }}" }, tokenQuery],
  },
  options: httpOpts(60000),
}, { onError: 'continueErrorOutput' });
connect('Ready to Publish?', 'Publish Reel', 0);

node('Get Permalink', 'n8n-nodes-base.httpRequest', 4.2, [2680, 300], {
  method: 'GET',
  url: `=${GRAPH}/{{ $json.id }}`,
  sendQuery: true,
  queryParameters: { parameters: [{ name: 'fields', value: 'permalink' }, tokenQuery] },
  options: httpOpts(30000),
}, { onError: 'continueRegularOutput' });
connect('Publish Reel', 'Get Permalink', 0);

node('Send Success DM?', 'n8n-nodes-base.if', 2, [2900, 300], ifParams([
  cond('s1', `={{ ${CFG}.SEND_DM_CONFIRMATIONS }}`, OP.isTrue),
]));
connect('Get Permalink', 'Send Success DM?');

node('DM: Posted', 'n8n-nodes-base.httpRequest', 4.2, [3120, 220], {
  method: 'POST',
  url: `=${GRAPH}/me/messages`,
  sendQuery: true,
  queryParameters: { parameters: [tokenQuery] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody:
    "={{ JSON.stringify({ recipient: { id: $('Prepare Job').item.json.senderId }, message: { text: '\\u2705 Reposted to your channel!' + ($json.permalink ? '\\n' + $json.permalink : '') } }) }}",
  options: httpOpts(30000),
}, { onError: 'continueRegularOutput' });
connect('Send Success DM?', 'DM: Posted', 0);

// ------------------------------------------------------------------ failure path
node('Describe Failure', 'n8n-nodes-base.set', 3.4, [2460, 760], {
  mode: 'manual',
  assignments: {
    assignments: [
      { id: uid('df1'), name: 'failedStep', value: '={{ $prevNode.name }}', type: 'string' },
      {
        id: uid('df2'),
        name: 'reason',
        value:
          "={{ $json.error ? (typeof $json.error === 'string' ? $json.error : ($json.error.message || JSON.stringify($json.error))) : ($json.status_code ? ('Instagram status ' + $json.status_code + ': ' + ($json.status || '')) : 'Instagram took longer than 10 minutes to process the video') }}",
        type: 'string',
      },
    ],
  },
  includeOtherFields: false,
  options: {},
});
connect('Render Branded Video (FFmpeg)', 'Describe Failure', 1);
connect('Create Media Container', 'Describe Failure', 1);
connect('Check Container Status', 'Describe Failure', 1);
connect('Failed or Timed Out?', 'Describe Failure', 0);
connect('Publish Reel', 'Describe Failure', 1);

node('Send Failure DM?', 'n8n-nodes-base.if', 2, [2680, 760], ifParams([
  cond('fd1', `={{ ${CFG}.SEND_DM_CONFIRMATIONS }}`, OP.isTrue),
]));
connect('Describe Failure', 'Send Failure DM?');

node('DM: Failed', 'n8n-nodes-base.httpRequest', 4.2, [2900, 680], {
  method: 'POST',
  url: `=${GRAPH}/me/messages`,
  sendQuery: true,
  queryParameters: { parameters: [tokenQuery] },
  sendBody: true,
  specifyBody: 'json',
  jsonBody:
    "={{ JSON.stringify({ recipient: { id: $('Prepare Job').item.json.senderId }, message: { text: ('\\u274C Could not repost that Reel.\\nStep: ' + $json.failedStep + '\\nReason: ' + $json.reason).slice(0, 900) } }) }}",
  options: httpOpts(30000),
}, { onError: 'continueRegularOutput' });
connect('Send Failure DM?', 'DM: Failed', 0);

node('Stop: Repost Failed', 'n8n-nodes-base.stopAndError', 1, [3120, 760], {
  errorMessage: "=Repost failed at \"{{ $('Describe Failure').item.json.failedStep }}\": {{ $('Describe Failure').item.json.reason }}",
});
connect('DM: Failed', 'Stop: Repost Failed');
connect('Send Failure DM?', 'Stop: Repost Failed', 1);

// ------------------------------------------------------------------ write file
const workflow = {
  id: 'IgReelRepost2026',
  name: 'Instagram Reel Auto-Reposter',
  nodes,
  connections,
  active: false,
  settings: { executionOrder: 'v1', saveManualExecutions: true, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all' },
  pinData: {},
  meta: { templateCredsSetupCompleted: true },
  tags: [],
};

const out = path.join(__dirname, '..', 'workflows', 'ig_reel_reposter.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(workflow, null, 2) + '\n');
console.log(`Wrote ${out} (${nodes.length} nodes)`);
