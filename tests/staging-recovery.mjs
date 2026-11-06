import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyStagingRecovery} from '../scripts/verify-staging-recovery.mjs';

const env={
 CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
 CLOUDFLARE_API_TOKEN:'test-token',
 CLOUDFLARE_D1_DATABASE_ID:'11111111-1111-4111-8111-111111111111',
 CLOUDFLARE_STAGING_D1_DATABASE_ID:'22222222-2222-4222-8222-222222222222',
 CURRENT_VERSION:'33333333-3333-4333-8333-333333333333',
 TARGET_VERSION:'44444444-4444-4444-8444-444444444444',
 TARGET_RELEASE:'f'.repeat(40),
};
let requests=[];
function mock({current=env.CURRENT_VERSION,tag=env.TARGET_RELEASE,db=env.CLOUDFLARE_STAGING_D1_DATABASE_ID}={}){
 requests=[];
 return async(url,options)=>{
  requests.push({url,method:options.method});
  assert.equal(options.method,'GET','Staging recovery rehearsal MUST be read-only');
  assert(url.includes('/workers/scripts/dalmuti-family-staging/'),'Staging recovery must never access production Worker');
  if(url.endsWith('/deployments'))return Response.json({success:true,result:{deployments:[{versions:[{version_id:current,percentage:100}]}]}});
  if(url.endsWith('/versions/'+env.TARGET_VERSION))return Response.json({success:true,result:{id:env.TARGET_VERSION,annotations:{'workers/tag':tag},resources:{bindings:[{name:'DB',database_id:db}]}}});
  throw Error('Unexpected Cloudflare API path');
 };
}
assert.match(await verifyStagingRecovery(env,mock()),/no Worker or D1 changed/);
assert.equal(requests.length,2);
assert(requests.every(x=>x.method==='GET'));
await assert.rejects(verifyStagingRecovery(env,mock({current:'55555555-5555-4555-8555-555555555555'})),/active version changed/);
await assert.rejects(verifyStagingRecovery(env,mock({tag:'e'.repeat(40)})),/different version ID or release tag/);
await assert.rejects(verifyStagingRecovery(env,mock({db:env.CLOUDFLARE_D1_DATABASE_ID})),/DB binding/);
await assert.rejects(verifyStagingRecovery({...env,CLOUDFLARE_STAGING_D1_DATABASE_ID:env.CLOUDFLARE_D1_DATABASE_ID},mock()),/distinct/);
const workflow=readFileSync('.github/workflows/staging-recovery.yml','utf8');
assert.match(workflow,/workflow_dispatch:/);
assert.match(workflow,/group: crownturn-staging/);
assert.match(workflow,/environment: staging/);
assert.match(workflow,/secrets\.CLOUDFLARE_STAGING_API_TOKEN/);
assert.doesNotMatch(workflow,/secrets\.CLOUDFLARE_API_TOKEN|wrangler deploy|d1 migrations apply|restore|mode:/i,'Read-only staging workflow must not contain write commands');
console.log('Passed: staging recovery is read-only, binds staging D1, rejects wrong Worker versions and cannot access production.');
