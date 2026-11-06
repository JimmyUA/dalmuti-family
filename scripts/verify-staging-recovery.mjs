import {pathToFileURL} from 'node:url';

const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const sha=/^[a-f0-9]{40}$/i;

// Explicitly read-only. A live staging restore is an operational decision and
// must not be used as an implicit side effect of an automated test.
export async function verifyStagingRecovery(env,fetcher=fetch){
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,CURRENT_VERSION:current,TARGET_VERSION:target,TARGET_RELEASE:release,CLOUDFLARE_STAGING_D1_DATABASE_ID:stagingDb,CLOUDFLARE_D1_DATABASE_ID:productionDb}=env;
 if(!/^[a-f0-9]{32}$/i.test(account||'')||!token||!uuid.test(current||'')||!uuid.test(target||'')||!sha.test(release||''))throw Error('Cloudflare account, staging token, current/target Worker UUIDs and full target SHA required.');
 if(!uuid.test(stagingDb||'')||!uuid.test(productionDb||'')||stagingDb.toLowerCase()===productionDb.toLowerCase())throw Error('Staging and production D1 UUIDs must be valid and distinct.');
 const base='https://api.cloudflare.com/client/v4/accounts/'+account+'/workers/scripts/dalmuti-family-staging';
 async function read(path){
  const response=await fetcher(base+path,{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||!data.success)throw Error('Cloudflare staging read-only check failed. Check deployments and token permissions.');
  return data.result;
 }
 const deployments=await read('/deployments');
 const active=deployments.deployments?.[0];
 if(active?.versions?.length!==1||active.versions[0].version_id!==current||active.versions[0].percentage!==100)throw Error('Staging active version changed or traffic is split. Refresh history.');
 const version=await read('/versions/'+target);
 if(version.id!==target||version.annotations?.['workers/tag']!==release)throw Error('Staging recovery target has a different version ID or release tag.');
 // Bindings are version-specific. Only validate when the version API supplies
 // binding metadata; require human binding review before any actual restore.
 const bindings=version.resources?.bindings||version.bindings;
 if(Array.isArray(bindings)){
  const db=bindings.find(x=>x.name==='DB');
  if(!db||db.id&&db.id.toLowerCase()!==stagingDb.toLowerCase()||db.database_id&&db.database_id.toLowerCase()!==stagingDb.toLowerCase())throw Error('Staging target DB binding is absent or disagrees with staging D1.');
 }
 return 'Staging recovery target verified; no Worker or D1 changed. Review version bindings and persisted-room compatibility before any restore.';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(await verifyStagingRecovery(process.env))}
 catch(e){console.error(e.message);process.exitCode=1}
}
