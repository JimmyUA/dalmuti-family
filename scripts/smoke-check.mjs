import {readFileSync} from 'node:fs';

const workers={production:'dalmuti-family',staging:'dalmuti-family-staging'};
export function deploymentUrl(log,workerName=workers.production){
 if(!Object.values(workers).includes(workerName))throw Error('Unknown Cloudflare Worker.');
 const matches=log.match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+\.workers\.dev\b/g)||[];
 const found=matches.filter(url=>new URL(url).hostname.startsWith(workerName+'.'));
 if(!found.length)throw Error('No deployed '+workerName+' workers.dev URL found in Wrangler output.');
 return found.at(-1);
}
export async function checkDeployment(url,release,fetcher=fetch,expectedEnvironment=null){
 const origin=new URL(url);
 if(origin.protocol!=='https:'||!origin.hostname.endsWith('.workers.dev'))throw Error('Invalid deployment URL');
 if(expectedEnvironment&&expectedEnvironment!=='staging')throw Error('Unsupported smoke check environment.');
 if(expectedEnvironment==='staging'&&!origin.hostname.startsWith(workers.staging+'.'))throw Error('Staging smoke check cannot target a production Worker URL.');
 const headers={'Cache-Control':'no-cache'};
 const health=await fetcher(new URL('/api/health?release='+release,origin),{headers,signal:AbortSignal.timeout(10000)});
 const report=await health.json();
 if(health.status!==200||report.status!=='ok'||report.release!==release||!report.checks?.database||!report.checks?.rateLimits)throw Error('Deployment health or release check failed.');
 const page=await fetcher(origin,{headers,signal:AbortSignal.timeout(10000)});
 if(page.status!==200||!(await page.text()).includes('Crownturn'))throw Error('Game page check failed.');
 const api=await fetcher(new URL('/api/game',origin),{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({type:'poll',id:crypto.randomUUID(),code:'000000'}),signal:AbortSignal.timeout(10000)});
 if(![403,404].includes(api.status)||api.headers.get('X-Release-SHA')!==release)throw Error('Game API release check failed.');
 if(expectedEnvironment==='staging'){
  for(const [name,response] of [['health',health],['game page',page],['game API',api]]){
   if(response.headers.get('X-Crownturn-Environment')!=='staging'||response.headers.get('X-Robots-Tag')!=='noindex, nofollow')throw Error('Staging isolation headers missing from '+name);
  }
 }
}
if(process.argv[1]?.endsWith('smoke-check.mjs')){
 const release=process.env.CROWNTURN_RELEASE_SHA||process.env.GITHUB_SHA;
 if(!/^[a-f0-9]{40}$/i.test(release||''))throw Error('CROWNTURN_RELEASE_SHA or GITHUB_SHA is required');
 const target=process.argv[3]||'production';
 if(!Object.hasOwn(workers,target))throw Error('Choose production or staging smoke check.');
 const url=deploymentUrl(readFileSync(process.argv[2],'utf8'),workers[target]);
 let passed=false;
 for(let attempt=0;attempt<10;attempt++){
  try{await checkDeployment(url,release,fetch,target==='staging'?'staging':null);passed=true;break}
  catch{if(attempt<9)await new Promise(r=>setTimeout(r,3000))}
 }
 if(!passed)throw Error('Post-deployment smoke check failed. Inspect Worker logs; deployment may already be live.');
 console.log('Verified '+target+' release '+release+' at '+url);
}
