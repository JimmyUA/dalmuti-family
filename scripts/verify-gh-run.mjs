import {appendFileSync} from 'node:fs';

const sha40=/^[a-f0-9]{40}$/i;
export function validateTrustedRun(run,kind,repo){
 const file=kind==='ci'?'ci.yml':'staging.yml';
 if(!['ci','staging'].includes(kind))throw Error('Unsupported GitHub workflow kind');
 if(!run||run.head_repository?.full_name!==repo||run.head_branch!=='main'||run.status!=='completed'||run.conclusion!=='success')throw Error('Run must be a successful trusted main-branch workflow');
 if(!run.path?.startsWith('.github/workflows/'+file))throw Error('Unexpected GitHub workflow path');
 if(kind==='ci'&&run.event!=='push')throw Error('CI artifact must come from a main push, never a PR or manual run');
 if(kind==='staging'&&!['workflow_run','workflow_dispatch'].includes(run.event))throw Error('Expected automated or manual staging run');
 if(kind==='ci'&&!sha40.test(run.head_sha||''))throw Error('CI run does not have a valid source SHA');
 return run;
}
async function get(url){
 const token=process.env.GH_TOKEN||process.env.GITHUB_TOKEN;
 if(!token)throw Error('GitHub Actions token required for release validation');
 const response=await fetch('https://api.github.com'+url,{
  headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
  signal:AbortSignal.timeout(20000),
 });
 if(!response.ok)throw Error('GitHub API '+url+' returned HTTP '+response.status);
 return response.json();
}
export async function verifyRun(kind,id,requireCurrent=false){
 if(!/^[1-9]\d{0,17}$/.test(String(id)))throw Error('Valid numeric workflow run ID is required');
 const repo=process.env.GITHUB_REPOSITORY;
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo||''))throw Error('GITHUB_REPOSITORY required');
 const run=validateTrustedRun(await get('/repos/'+repo+'/actions/runs/'+id),kind,repo);
 if(requireCurrent){
  if(kind!=='ci')throw Error('Only CI can be checked against main head');
  const main=await get('/repos/'+repo+'/commits/main');
  if(main.sha!==run.head_sha)throw Error('CI release is stale: a newer commit is on main. Refusing out-of-order staging deploy.');
 }
 if(process.env.GITHUB_OUTPUT){
  appendFileSync(process.env.GITHUB_OUTPUT,'run_id='+run.id+'\n');
  if(kind==='ci')appendFileSync(process.env.GITHUB_OUTPUT,'release_sha='+run.head_sha+'\n');
 }
 console.log('Verified '+kind+' run '+run.id+' from main '+(kind==='ci'?run.head_sha:''));
 return run;
}
if(process.argv[1]?.endsWith('verify-gh-run.mjs')){
 await verifyRun(process.argv[2],process.argv[3],process.argv[4]==='current');
}
