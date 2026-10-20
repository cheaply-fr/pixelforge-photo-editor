const auth = require('/Users/faro/Documents/Codex/2026-08-26/we/cheaply-presence-cloud/node_modules/.pnpm/firebase-tools@15.28.1_@types+node@26.3.0_supports-color@7.2.0/node_modules/firebase-tools/lib/auth.js');
const {Storage} = require('./marketplace-photoeditor/node_modules/@google-cloud/storage');
const {OAuth2Client} = require('./marketplace-photoeditor/node_modules/google-auth-library');
(async () => {
 const account = auth.getGlobalDefaultAccount();
 if (account?.user?.email !== 'cheaply.fr@gmail.com') throw Error('Unexpected account');
 const token = await auth.getAccessToken(account.tokens.refresh_token, []);
 const client = new OAuth2Client(); client.setCredentials({access_token: token.access_token});
 const bucket = new Storage({authClient:client}).bucket('blissful-scout-290322-pixelforge-projects');
 const file = bucket.file('diagnostics/pixelforge-' + require('node:crypto').randomUUID() + '.json');
 let latest;
 try {
  await file.save('{"test":"PixelForge generated fixture"}', {resumable:false,preconditionOpts:{ifGenerationMatch:'0'},metadata:{contentType:'application/json',metadata:{name:'Generated verification fixture'}}});
  const first = String(file.metadata.generation); latest=first;
  if (!/^\d+$/.test(first)) throw Error('Save did not populate generation');
  const [contents] = await bucket.file(file.name,{generation:first}).download();
  if (JSON.parse(contents).test !== 'PixelForge generated fixture') throw Error('Round-trip failed');
  await file.save('{"test":"Updated fixture"}',{resumable:false,preconditionOpts:{ifGenerationMatch:first}}); latest=String(file.metadata.generation);
  try { await file.save('{}',{resumable:false,preconditionOpts:{ifGenerationMatch:first}}); throw Error('Stale update unexpectedly succeeded'); } catch (error) { if (Number(error.code)!==412) throw error; }
  console.log(JSON.stringify({roundTrip:true,generationReturned:true,staleOverwriteRejected:true}));
 } finally { if (latest) await file.delete({ifGenerationMatch:latest}); }
})().catch(error=>{console.error(error.message);process.exitCode=1});
