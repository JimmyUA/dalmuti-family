import assert from 'node:assert/strict';
import {recoverProduction} from '../scripts/recover-production.mjs';
const current='11111111-1111-1111-1111-111111111111',target='22222222-2222-2222-2222-222222222222',release='a'.repeat(40);
const env={CLOUDFLARE_ACCOUNT_ID:'b'.repeat(32),CLOUDFLARE_API_TOKEN:'test',CURRENT_VERSION:current,TARGET_VERSION:target,TARGET_RELEASE:release,RECOVERY_MODE:'verify',DEPLOY_ENABLED:'false'};
function mock({tag=release,active=current,failWrite=false}={}){
 const calls=[];return {calls,fetch:async(url,options)=>{
  calls.push({url,options});let result;
  if(options.method==='POST'){
   if(failWrite)return Response.json({success:false},{status:400});
   assert.deepEqual(JSON.parse(options.body).versions,[{version_id:target,percentage:100}]);active=target;result={id:'deployment'};
  }else if(url.endsWith('/deployments'))result={deployments:[{versions:[{version_id:active,percentage:100}]}]};
  else result={id:target,annotations:{'workers/tag':tag}};
  return Response.json({success:true,result});
 }};
}
let m=mock();assert.match(await recoverProduction(env,m.fetch),/unchanged/);assert.equal(m.calls.filter(c=>c.options.method==='POST').length,0);
m=mock();let verified=false;assert.match(await recoverProduction({...env,RECOVERY_MODE:'restore'},m.fetch,async(url,sha)=>{assert.equal(sha,release);assert.match(url,/dalmuti-family/);verified=true;}),/Restored/);assert(verified);assert.equal(m.calls.filter(c=>c.options.method==='POST').length,1);
for(const options of [{tag:'wrong'},{active:target}]){m=mock(options);await assert.rejects(recoverProduction({...env,RECOVERY_MODE:'restore'},m.fetch));assert(!m.calls.some(c=>c.options.method==='POST'));}
m=mock();await assert.rejects(recoverProduction({...env,RECOVERY_MODE:'restore',DEPLOY_ENABLED:'true'},m.fetch),/Pause/);assert.equal(m.calls.length,0);
m=mock();await assert.rejects(recoverProduction({...env,TARGET_VERSION:'invalid'},m.fetch));assert.equal(m.calls.length,0);
m=mock({failWrite:true});await assert.rejects(recoverProduction({...env,RECOVERY_MODE:'restore'},m.fetch),/may be live/i);
console.log('Passed: read-only rehearsal, release/version guards, deployment pause, explicit restore and post-restore verification.');

// A deployment changing after target verification must stop before any write.
m=mock();let reads=0;const racing=async(url,options)=>{if(url.endsWith('/deployments')&&options.method==='GET'&&++reads===2)return Response.json({success:true,result:{deployments:[{versions:[{version_id:target,percentage:100}]}]}});return m.fetch(url,options);};
await assert.rejects(recoverProduction({...env,RECOVERY_MODE:'restore'},racing),/changed/);assert(!m.calls.some(c=>c.options.method==='POST'));
