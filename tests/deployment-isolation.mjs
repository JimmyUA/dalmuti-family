import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {deploymentUrl,checkDeployment} from '../scripts/smoke-check.mjs';

const dir=mkdtempSync(join(tmpdir(),'crownturn-deploy-isolation-'));
const productionId='11111111-1111-4111-8111-111111111111';
const stagingId='22222222-2222-4222-8222-222222222222';
const sha='a'.repeat(40);
const script=resolve('scripts/prepare-cloudflare-deploy.mjs');
try{
 mkdirSync(join(dir,'dist/server'),{recursive:true});
 writeFileSync(join(dir,'dist/server/wrangler.json'),JSON.stringify({
  name:'dalmuti-family',main:'index.js',no_bundle:true,compatibility_date:'2026-05-15',
  assets:{directory:'../client',binding:'ASSETS',run_worker_first:['/api/*','/']},
  triggers:{crons:['*/15 * * * *']},observability:{enabled:true},
 }));
 const baseEnv={
  ...process.env,
  CLOUDFLARE_ACCOUNT_ID:'a'.repeat(32),
  CLOUDFLARE_D1_DATABASE_ID:productionId,
  CLOUDFLARE_STAGING_D1_DATABASE_ID:stagingId,
  ROOM_IDLE_TTL_HOURS:'24',
  ROOM_ACTIVE_TTL_HOURS:'168',
 };
 function run(target,changes={}){
  const env={...baseEnv,CROWNTURN_DEPLOY_TARGET:target,...changes};
  const result=spawnSync(process.execPath,[script],{cwd:dir,env,encoding:'utf8'});
  return {success:result.status===0,output:result.stdout+'\n'+result.stderr,status:result.status};
 }
 let out=run('production');assert(out.success,out.output);
 const prod=JSON.parse(readFileSync(join(dir,'dist/server/github-deploy.json'),'utf8'));
 assert.equal(prod.name,'dalmuti-family');
 assert.equal(prod.d1_databases[0].database_name,'dalmuti-family');
 assert.equal(prod.d1_databases[0].database_id,productionId);
 assert.equal(prod.vars.CROWNTURN_ENV,'production');
 assert.deepEqual(prod.assets.run_worker_first,['/api/*','/']);
 assert.equal(prod.ratelimits[0].namespace_id,'730001');
 out=run('staging');assert(out.success,out.output);
 const stage=JSON.parse(readFileSync(join(dir,'dist/server/staging-deploy.json'),'utf8'));
 assert.equal(stage.name,'dalmuti-family-staging');
 assert.equal(stage.d1_databases[0].database_name,'dalmuti-family-staging');
 assert.equal(stage.d1_databases[0].database_id,stagingId);
 assert.equal(stage.vars.CROWNTURN_ENV,'staging');
 assert.equal(stage.assets.run_worker_first,true);
 assert.equal(stage.assets.directory,prod.assets.directory);
 assert.deepEqual(stage.triggers,prod.triggers);
 assert.deepEqual(stage.ratelimits.map(x=>x.name),prod.ratelimits.map(x=>x.name));
 assert(stage.ratelimits.every((lim,i)=>lim.namespace_id!==prod.ratelimits[i].namespace_id));
 assert(!run('staging',{CLOUDFLARE_STAGING_D1_DATABASE_ID:productionId}).success,'refuse production D1 as staging');
 assert(!run('staging',{CLOUDFLARE_STAGING_D1_DATABASE_ID:''}).success,'require separate staging D1');
 assert(!run('staging',{CLOUDFLARE_D1_DATABASE_ID:''}).success,'require production ID for isolation guard');
 assert(!run('production',{CLOUDFLARE_D1_DATABASE_ID:''}).success,'refuse unset production ID');
 assert(!run('preview').success,'refuse unknown environment');
 assert(!run('').success,'refuse implicit production default');
 assert(!run('staging',{CLOUDFLARE_STAGING_D1_DATABASE_ID:'not-a-uuid'}).success,'reject invalid DB');
}finally{rmSync(dir,{recursive:true,force:true})}

const stagingWorkflow=readFileSync('.github/workflows/staging.yml','utf8');
assert.match(stagingWorkflow,/workflow_dispatch:/);
assert.doesNotMatch(stagingWorkflow,/^\s+push:/m,'Phase 1 staging must be manual-only');
assert.match(stagingWorkflow,/environment: staging/);
assert.match(stagingWorkflow,/secrets\.CLOUDFLARE_STAGING_API_TOKEN/);
assert.doesNotMatch(stagingWorkflow,/secrets\.CLOUDFLARE_API_TOKEN/,'never fall back to production token');
assert.match(stagingWorkflow,/CROWNTURN_DEPLOY_TARGET: staging/);
assert.match(stagingWorkflow,/migrations apply DB --remote --config dist\/server\/staging-deploy\.json/);
assert.match(stagingWorkflow,/wrangler deploy --config dist\/server\/staging-deploy\.json/);
assert.doesNotMatch(stagingWorkflow,/--config dist\/server\/github-deploy\.json/,'staging cannot deploy production config');

const prodUrl='https://dalmuti-family.sergii-pryhodko.workers.dev';
const stageUrl='https://dalmuti-family-staging.sergii-pryhodko.workers.dev';
const log='Deployment complete:\n'+prodUrl+'\n'+stageUrl+'\n';
assert.equal(deploymentUrl(log),prodUrl);
assert.equal(deploymentUrl(log,'dalmuti-family-staging'),stageUrl);
assert.throws(()=>deploymentUrl(prodUrl,'dalmuti-family-staging'),/No deployed/);

function fetcher(isStaging=true){
 return async(input,init)=>{
  const url=new URL(input.toString());
  const headers=isStaging?{'X-Crownturn-Environment':'staging','X-Robots-Tag':'noindex, nofollow'}:{};
  if(url.pathname==='/api/health')return Response.json({status:'ok',release:sha,checks:{database:true,rateLimits:true}},{status:200,headers});
  if(url.pathname==='/api/game')return new Response('Not found',{status:404,headers:{...headers,'X-Release-SHA':sha}});
  return new Response('Crownturn game',{status:200,headers});
 };
}
await checkDeployment(stageUrl,sha,fetcher(), 'staging');
await checkDeployment(prodUrl,sha,fetcher(false));
await assert.rejects(checkDeployment(prodUrl,sha,fetcher(),'staging'),/cannot target a production/);
await assert.rejects(checkDeployment(stageUrl,sha,fetcher(false),'staging'),/headers missing/);
console.log('Passed: isolated Cloudflare configs, staging D1 protection, rate-limit namespace isolation, noindex smoke checks and legacy recovery-compatible production smoke checks.');
