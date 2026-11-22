'use strict';
/**
 * Meta token helper.
 *
 * Turns the short-lived token from the Graph API Explorer into a NEVER-EXPIRING
 * Page Access Token, finds the Instagram Business Account ID, and subscribes your
 * Facebook Page to the app so Instagram DMs reach the webhook.
 *
 * Run:  docker compose exec ffmpeg-api node tools/meta-setup.js
 */
const readline = require('readline');

const V = process.env.GRAPH_API_VERSION || 'v22.0';
const G = `https://graph.facebook.com/${V}`;

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));

async function graph(method, pathAndQuery, params = {}) {
  const url = new URL(pathAndQuery.startsWith('http') ? pathAndQuery : `${G}${pathAndQuery}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error || {};
    throw new Error(`${e.message || `HTTP ${res.status}`}${e.code ? ` (code ${e.code})` : ''}`);
  }
  return json;
}

(async () => {
  console.log('\n=== Meta token helper ===\n');
  console.log('You need 3 things (README step 8 explains where to find them):');
  console.log('  1. App ID        (App Dashboard -> App settings -> Basic)');
  console.log('  2. App Secret    (same page, click "Show")');
  console.log('  3. A User Access Token from the Graph API Explorer with the required permissions\n');

  const appId = await ask('Paste your App ID: ');
  const appSecret = await ask('Paste your App Secret: ');
  const shortToken = await ask('Paste the User Access Token from Graph API Explorer: ');
  if (!appId || !appSecret || !shortToken) throw new Error('All three values are required.');

  console.log('\n[1/4] Exchanging for a 60-day long-lived user token...');
  const ll = await graph('GET', '/oauth/access_token', {
    grant_type: 'fb_exchange_token',
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });

  console.log('[2/4] Looking up your Facebook Pages and linked Instagram accounts...');
  const pages = await graph('GET', '/me/accounts', {
    fields: 'id,name,access_token,instagram_business_account{id,username}',
    limit: '100',
    access_token: ll.access_token,
  });
  const withIg = (pages.data || []).filter((p) => p.instagram_business_account);
  if (!withIg.length) {
    throw new Error(
      'No Facebook Page with a linked Instagram Professional account was found.\n' +
        '  - Make sure Account B is a Business/Creator account linked to your Facebook Page.\n' +
        '  - When logging in through the Graph API Explorer, tick that Page and that Instagram account.'
    );
  }

  let page = withIg[0];
  if (withIg.length > 1) {
    console.log('\nMultiple Pages found:');
    withIg.forEach((p, i) => console.log(`  ${i + 1}. ${p.name}  (Instagram: @${p.instagram_business_account.username || '?'})`));
    const pick = Number(await ask(`Which one is Account B? [1-${withIg.length}]: `));
    page = withIg[(pick || 1) - 1] || withIg[0];
  }
  const ig = page.instagram_business_account;
  console.log(`      Using Page "${page.name}" -> Instagram @${ig.username || '?'} (${ig.id})`);

  console.log('[3/4] Subscribing your Page to the app (so DMs trigger the webhook)...');
  let subscribed = false;
  for (const fields of ['messages', 'feed']) {
    try {
      await graph('POST', `/${page.id}/subscribed_apps`, { subscribed_fields: fields, access_token: page.access_token });
      console.log(`      Subscribed (fields: ${fields}).`);
      subscribed = true;
      break;
    } catch (err) {
      if (fields === 'feed') console.log(`      Warning: could not subscribe the Page automatically: ${err.message}`);
    }
  }

  console.log('[4/4] Checking that the Page token never expires...');
  let expiry = 'unknown';
  try {
    const dbg = await graph('GET', '/debug_token', {
      input_token: page.access_token,
      access_token: `${appId}|${appSecret}`,
    });
    const exp = dbg.data && dbg.data.expires_at;
    expiry = exp === 0 ? 'NEVER expires' : `expires ${new Date(exp * 1000).toISOString()}`;
    const scopes = (dbg.data && dbg.data.scopes) || [];
    const needed = ['instagram_basic', 'instagram_content_publish', 'instagram_manage_messages'];
    const missing = needed.filter((s) => !scopes.includes(s));
    if (missing.length) console.log(`      WARNING: token is missing permissions: ${missing.join(', ')}`);
  } catch (err) {
    console.log(`      (could not check: ${err.message})`);
  }
  console.log(`      Token status: ${expiry}`);

  console.log('\n================  COPY THESE INTO YOUR .env FILE  ================\n');
  console.log(`META_PAGE_ACCESS_TOKEN=${page.access_token}`);
  console.log(`IG_BUSINESS_ACCOUNT_ID=${ig.id}`);
  console.log('\n==================================================================\n');
  if (!subscribed) {
    console.log('Note: Page subscription failed - see README troubleshooting "No executions appear when I DM".\n');
  }
  console.log('Keep the token secret. Anyone with it can post to your Instagram.\n');
})()
  .catch((err) => {
    console.error(`\nERROR: ${err.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
