import {expiryPolicy} from '../app/expiry.ts';
import {rateLimitsFor} from './rate-limit-config.mjs';
import {readFileSync,writeFileSync} from 'node:fs';

const target=process.env.CROWNTURN_DEPLOY_TARGET;
if(!['production','staging'].includes(target))throw Error('Set CROWNTURN_DEPLOY_TARGET explicitly to production or staging.');
const staging=target==='staging';
const account=process.env.CLOUDFLARE_ACCOUNT_ID;
const productionDb=process.env.CLOUDFLARE_D1_DATABASE_ID;
const stagingDb=process.env.CLOUDFLARE_STAGING_D1_DATABASE_ID;
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const validDb=id=>uuid.test(id||'')&&id.toLowerCase()!=='00000000-0000-4000-8000-000000000000';
if(!/^[a-f0-9]{32}$/i.test(account||''))throw Error('Set CLOUDFLARE_ACCOUNT_ID to the Cloudflare account ID.');
if(!validDb(productionDb))throw Error('Set CLOUDFLARE_D1_DATABASE_ID to the existing production D1 UUID (used as a staging isolation guard).');
if(staging&&!validDb(stagingDb))throw Error('Set CLOUDFLARE_STAGING_D1_DATABASE_ID to a separate staging D1 UUID.');
if(staging&&stagingDb.toLowerCase()===productionDb.toLowerCase())throw Error('SECURITY: staging D1 UUID equals production D1 UUID. Refusing deployment.');
const database=staging?stagingDb:productionDb;
const worker=staging?'dalmuti-family-staging':'dalmuti-family';
const source=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
if(!source.main||!source.assets?.directory||source.assets?.binding!=='ASSETS')throw Error('Run pnpm build:production before preparing deployment.');
expiryPolicy(process.env);

// Only staging routes all static assets through the Worker for the noindex header.
// Production keeps its existing static asset fast path and routing configuration.
const config={
 ...source,
 name:worker,
 account_id:account,
 workers_dev:true,
 vars:{
  ...source.vars,
  ROOM_IDLE_TTL_HOURS:process.env.ROOM_IDLE_TTL_HOURS||'24',
  ROOM_ACTIVE_TTL_HOURS:process.env.ROOM_ACTIVE_TTL_HOURS||'168',
  CROWNTURN_ENV:target,
 },
 assets:staging?{...source.assets,run_worker_first:true}:source.assets,
 ratelimits:rateLimitsFor(target),
 d1_databases:[{binding:'DB',database_name:worker,database_id:database,migrations_dir:'../../drizzle'}],
};
const output=staging?'dist/server/staging-deploy.json':'dist/server/github-deploy.json';
writeFileSync(output,JSON.stringify(config,null,2)+'\n');
console.log('Prepared '+target+' Cloudflare configuration for '+worker+'.');
