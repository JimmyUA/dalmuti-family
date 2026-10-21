import {pathToFileURL} from 'node:url';
import {checkDeployment} from './smoke-check.mjs';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function recoverProduction(env,fetcher=fetch,verify=checkDeployment){
 const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_API_TOKEN:token,TARGET_VERSION:target,CURRENT_VERSION:current,TARGET_RELEASE:release}=env;
 if(!/^[a-f0-9]{32}$/i.test(account||'')||!token||!uuid.test(target||'')||!uuid.test(current||'')||! /^[a-f0-9]{40}$/i.test(release||''))throw Error('Account, token, current/target version UUIDs and full release SHA are required.');
 if(!['verify','restore'].includes(env.RECOVERY_MODE))throw Error('Choose verify or restore.');
 if(env.RECOVERY_MODE==='restore'&&env.DEPLOY_ENABLED!=='false')throw Error('Pause automatic deployment: set DEPLOY_ENABLED=false first.');
 const base=`https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/dalmuti-family`;
 async function api(path,body){
  const response=await fetcher(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await response.json();
  if(!response.ok||!data.success)throw Error('Cloudflare recovery API failed; inspect deployment history before retrying.');
  return data.result;
 }
 async function assertCurrent(expected){
  const history=await api('/deployments');const active=history.deployments?.[0];
  if(active?.versions?.length!==1||active.versions[0].version_id!==expected||active.versions[0].percentage!==100)throw Error('Active version changed or traffic is split. Refresh deployment history.');
 }
 await assertCurrent(current);
 const version=await api('/versions/'+target);
 if(version.id!==target||version.annotations?.['workers/tag']!==release)throw Error('Target version does not carry the expected release SHA tag.');
 if(env.RECOVERY_MODE==='verify')return 'Recovery target verified; production unchanged.';
 await assertCurrent(current);
 try{
  await api('/deployments',{strategy:'percentage',versions:[{version_id:target,percentage:100}],annotations:{'workers/message':'Recover '+release}});
  await assertCurrent(target);
  let lastError;
  for(let attempt=0;attempt<10;attempt++){
   try{await verify('https://dalmuti-family.sergii-pryhodko.workers.dev/',release,fetcher);return 'Restored and verified release '+release;}
   catch(error){lastError=error;if(attempt<9)await new Promise(resolve=>setTimeout(resolve,3000));}
  }
  throw lastError;
 }catch(error){throw Error('Recovery was submitted and may be live. Inspect deployment history and Diagnostics before any further action.',{cause:error});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{console.log(await recoverProduction(process.env));}catch(error){console.error(error.message);process.exitCode=1;}
}
