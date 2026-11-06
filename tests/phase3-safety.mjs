import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {monitorBoth,probe,monitored} from '../scripts/monitor-endpoints.mjs';
import {stagingOrigin,stagingRequest,STAGING_ORIGIN} from './staging-api-e2e.mjs';

const sha='a'.repeat(40);
assert.equal(stagingOrigin(),STAGING_ORIGIN);
for(const url of ['https://crownturn.com','https://dalmuti-family.sergii-pryhodko.workers.dev','http://dalmuti-family-staging.sergii-pryhodko.workers.dev','https://dalmuti-family-staging.sergii-pryhodko.workers.dev.evil.test']){
 assert.throws(()=>stagingOrigin(url),/isolated staging Worker/);
}
const fetcher=async url=>{
 const staging=url.includes('dalmuti-family-staging');
 const headers=staging?{'X-Crownturn-Environment':'staging','X-Robots-Tag':'noindex, nofollow','X-Release-SHA':sha}:{'X-Release-SHA':sha};
 if(url.includes('/api/health'))return Response.json({status:'ok',release:sha,checks:{database:true,rateLimits:true}},{headers});
 return new Response('Crownturn',{headers});
};
const health=await monitorBoth(fetcher);
assert.deepEqual(health.map(h=>h.name),['production','staging']);
await assert.rejects(probe(monitored[1],async url=>new Response('broken',{status:503})),/status/);
await assert.rejects(probe(monitored[0],async url=>{
 const result=await fetcher(url);result.headers.set('X-Crownturn-Environment','staging');return result;
}),/points to staging/);
await assert.rejects(probe({...monitored[0],origin:'https://other.site'},fetcher),/unknown/);
await assert.rejects(stagingRequest('https://crownturn.com',{type:'poll'},fetcher),/isolated staging Worker/);
const staging=readFileSync('.github/workflows/staging.yml','utf8');
const monitoring=readFileSync('.github/workflows/monitor.yml','utf8');
const release=readFileSync('.github/workflows/release.yml','utf8');
assert(staging.indexOf('node tests/staging-api-e2e.mjs')<staging.indexOf('node scripts/staging-proof.mjs record'));
assert(staging.indexOf('node tests/staging-browser.mjs')<staging.indexOf('node scripts/staging-proof.mjs record'));
assert.match(staging,/playwright@1\.56\.1/);
assert.match(staging,/CROWNTURN_PLAYWRIGHT_MODULE/);
assert.doesNotMatch(staging,/https:\/\/crownturn\.com/,'Staging E2E must not use the production origin');
assert.match(monitoring,/schedule:/);
assert.match(monitoring,/node scripts\/monitor-endpoints\.mjs/);
assert.doesNotMatch(monitoring,/CLOUDFLARE_API_TOKEN|wrangler deploy|d1 migrations apply/);
assert.doesNotMatch(release,/staging-api-e2e|staging-browser/,'Production must never run staging game mutations');
console.log('Passed: staging-only E2E target, synthetic monitoring, scheduled read-only workflow and release gate order.');
