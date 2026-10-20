const fs = require('node:fs');
const auth = require('/Users/faro/Documents/Codex/2026-08-26/we/cheaply-presence-cloud/node_modules/.pnpm/firebase-tools@15.28.1_@types+node@26.3.0_supports-color@7.2.0/node_modules/firebase-tools/lib/auth.js');
(async () => {
  const account = auth.getGlobalDefaultAccount();
  if (account?.user?.email !== 'cheaply.fr@gmail.com') throw new Error('Unexpected Google account');
  const token = await auth.getAccessToken(account.tokens.refresh_token, []);
  const request = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (!new URL(request.url).hostname.endsWith('.googleapis.com')) throw new Error('Only Google APIs permitted');
  const response = await fetch(request.url, { method: request.method || 'GET', headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' }, body: request.body ? JSON.stringify(request.body) : undefined });
  const body = await response.json();
  console.log(JSON.stringify({ status: response.status, body }, null, 2));
  if (!response.ok) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
