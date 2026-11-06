import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {packBundle,verifyBundle,extractBundle} from '../scripts/release-bundle.mjs';
import {validateTrustedRun} from '../scripts/verify-gh-run.mjs';
import {createProof,inspectProof,readProof} from '../scripts/staging-proof.mjs';
import {migrationRisks,verifyMigrations} from '../scripts/check-release-migrations.mjs';
import {assertProductionDomain,assertStagingRelease} from '../scripts/check-release-host.mjs';

const sha='a'.repeat(40), other='b'.repeat(40);
const repo='JimmyUA/dalmuti-family';
const run={id:123,event:'push',head_branch:'main',head_sha:sha,head_repository:{full_name:repo},status:'completed',conclusion:'success',path:'.github/workflows/ci.yml'};
assert.equal(validateTrustedRun(run,'ci',repo).head_sha,sha);
for(const fake of [{...run,event:'pull_request'},{...run,head_branch:'feature'},{...run,conclusion:'failure'},{...run,head_repository:{full_name:'other/repo'}},{...run,path:'.github/workflows/recovery.yml'}])assert.throws(()=>validateTrustedRun(fake,'ci',repo));
const stage={...run,id:124,event:'workflow_run',path:'.github/workflows/staging.yml'};
assert.equal(validateTrustedRun(stage,'staging',repo).id,124);
assert.throws(()=>validateTrustedRun({...stage,event:'pull_request'},'staging',repo));
assert.deepEqual(migrationRisks('0003_add.sql','ALTER TABLE rooms ADD COLUMN nickname TEXT;'),[]);
assert(migrationRisks('0003_bad.sql','DROP TABLE rooms;').length>0);
assert(migrationRisks('0003_bad.sql','UPDATE rooms SET state = NULL;').length>0);
assert(migrationRisks('0003_bad.sql','ALTER TABLE rooms RENAME TO old_rooms;').length>0);
assert(migrationRisks('0003_bad.sql','ALTER TABLE rooms ADD COLUMN flag INT NOT NULL;').length>0);

const cwd=process.cwd(),dir=mkdtempSync(join(tmpdir(),'crownturn-release-'));
try{
 process.chdir(dir);
 mkdirSync('dist/server',{recursive:true});mkdirSync('dist/client',{recursive:true});
 writeFileSync('dist/server/index.js','export default {};');
 writeFileSync('dist/server/wrangler.json',JSON.stringify({main:'index.js'}));
 writeFileSync('dist/client/index.html','<h1>Crownturn</h1>');
 const manifest=packBundle(sha);
 assert.equal(manifest.releaseSha,sha);
 assert.equal(verifyBundle(sha).sha256,manifest.sha256);
 assert.throws(()=>verifyBundle(other),/wrong source commit/);
 assert.throws(()=>verifyBundle(sha,'0'.repeat(64)),/digest disagrees/);
 const log='Current Version ID: d93953e5-737e-4368-8561-5f8aca609d01\nVerified staging release '+sha+' at https://dalmuti-family-staging.sergii-pryhodko.workers.dev\n';
 const proof=createProof({sha,ciRunId:'123',stagingRunId:'124',deployLog:log});
 assert.equal(proof.artifactSha256,manifest.sha256);
 assert.equal(inspectProof(sha,'124').workerVersion,proof.workerVersion);
 assert.equal(readProof(sha,'124').ciRunId,'123');
 assert.throws(()=>readProof(other,'124'));
 assert.throws(()=>readProof(sha,'125'));
 writeFileSync('release/crownturn-build.tar.gz','tampered');
 assert.throws(()=>verifyBundle(sha),/integrity/);
 assert.throws(()=>readProof(sha,'124'),/integrity/);
 packBundle(sha);
 rmSync('dist',{recursive:true,force:true});
 assert.equal(extractBundle(sha).releaseSha,sha);
 assert.match(readFileSync('dist/client/index.html','utf8'),/Crownturn/);
 mkdirSync('drizzle',{recursive:true});
 writeFileSync('drizzle/0002_previous.sql','UPDATE rooms SET state=NULL;');
 writeFileSync('drizzle/0003_good.sql','CREATE INDEX idx_test ON rooms(code);');
 verifyMigrations('drizzle');
 writeFileSync('drizzle/0004_bad.sql','DELETE FROM rooms;');
 assert.throws(()=>verifyMigrations('drizzle'),/Unsafe production migration/);
}finally{process.chdir(cwd);rmSync(dir,{recursive:true,force:true})}

const responseHeaders={'X-Crownturn-Environment':'staging','X-Robots-Tag':'noindex, nofollow'};
async function stagingFetch(request){
 const url=new URL(request);
 if(url.pathname==='/api/health')return Response.json({status:'ok',release:sha,checks:{database:true,rateLimits:true}},{headers:responseHeaders});
 if(url.pathname==='/api/game')return new Response('Not found',{status:404,headers:{...responseHeaders,'X-Release-SHA':sha}});
 return new Response('Crownturn',{headers:responseHeaders});
}
await assertStagingRelease(sha,stagingFetch);
await assert.rejects(assertStagingRelease(other,stagingFetch),/release check failed/);
async function productionFetch(request){
 const url=new URL(request);
 if(url.pathname==='/api/health')return Response.json({status:'ok',release:sha,checks:{database:true,rateLimits:true}});
 return new Response('Crownturn');
}
await assertProductionDomain(sha,productionFetch);
await assert.rejects(assertProductionDomain(other,productionFetch),/mismatch/);

const {readFileSync:read}=await import('node:fs');
const ci=read('.github/workflows/ci.yml','utf8'),stageYaml=read('.github/workflows/staging.yml','utf8'),production=read('.github/workflows/release.yml','utf8'),recovery=read('.github/workflows/recovery.yml','utf8');
assert.match(ci,/actions\/upload-artifact@v4/);
assert.match(ci,/node scripts\/release-bundle\.mjs pack/);
assert.match(stageYaml,/workflow_run:/);
assert.match(stageYaml,/workflow_dispatch:/);
assert.match(stageYaml,/workflow_run\.event == 'push'/);
assert.match(stageYaml,/node scripts\/verify-gh-run\.mjs ci/);
assert.match(stageYaml,/actions\/download-artifact@v4/);
assert.match(stageYaml,/node scripts\/release-bundle\.mjs extract/);
assert.match(stageYaml,/node scripts\/staging-proof\.mjs record/);
assert.doesNotMatch(stageYaml,/pnpm build:production/);
assert.doesNotMatch(stageYaml,/secrets\.CLOUDFLARE_API_TOKEN/);
assert.match(production,/workflow_dispatch:/);
assert.doesNotMatch(production,/^\s+push:/m);
assert.match(production,/environment: production/);
assert.match(production,/secrets\.CLOUDFLARE_PRODUCTION_RELEASE_API_TOKEN/);
assert.doesNotMatch(production,/secrets\.CLOUDFLARE_API_TOKEN/);
assert.match(production,/group: crownturn-production/);
assert.match(production,/PRODUCTION_RELEASES_ENABLED/);
assert.match(production,/scripts\/staging-proof\.mjs verify/);
assert.match(production,/scripts\/check-release-host\.mjs staging/);
assert.match(production,/node scripts\/check-release-migrations\.mjs/);
assert.match(production,/scripts\/check-release-host\.mjs production/);
assert.doesNotMatch(production,/pnpm build:production/);
assert.match(recovery,/PRODUCTION_RELEASES_ENABLED/);
console.log('Passed: tested artifact integrity, trusted CI/staging provenance, release safety gates, approval lock and recovery protection.');
