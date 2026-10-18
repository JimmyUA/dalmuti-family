import {readFileSync} from 'node:fs';
export function deploymentUrl(log){const matches=log.match(/https:\/\/dalmuti-family\.[a-z0-9.-]+\.workers\.dev\b/g);if(!matches?.length)throw Error('No deployed workers.dev URL found in Wrangler output.');return matches.at(-1)}
export async function checkDeployment(url,release,fetcher=fetch){
 const origin=new URL(url);if(origin.protocol!=='https:'||!origin.hostname.endsWith('.workers.dev'))throw Error('Invalid deployment URL');
 const headers={'Cache-Control':'no-cache'};
 const health=await fetcher(new URL('/api/health?release='+release,origin),{headers,signal:AbortSignal.timeout(10000)});
 const report=await health.json();if(health.status!==200||report.status!=='ok'||report.release!==release||!report.checks?.database||!report.checks?.rateLimits)throw Error('Deployment health or release check failed.');
 const page=await fetcher(origin,{headers,signal:AbortSignal.timeout(10000)});if(page.status!==200||!(await page.text()).includes('Crownturn'))throw Error('Game page check failed.');
 const api=await fetcher(new URL('/api/game',origin),{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({type:'poll',id:crypto.randomUUID(),code:'000000'}),signal:AbortSignal.timeout(10000)});
 if(![403,404].includes(api.status)||api.headers.get('X-Release-SHA')!==release)throw Error('Game API release check failed.');
}
if(process.argv[1]?.endsWith('smoke-check.mjs')){
 const release=process.env.GITHUB_SHA;if(!/^[a-f0-9]{40}$/i.test(release||''))throw Error('GITHUB_SHA is required');
 const url=deploymentUrl(readFileSync(process.argv[2],'utf8'));let passed=false;
 for(let attempt=0;attempt<10;attempt++){try{await checkDeployment(url,release);passed=true;break}catch{if(attempt<9)await new Promise(r=>setTimeout(r,3000))}}
 if(!passed)throw Error('Post-deployment smoke check failed. Inspect Worker logs; deployment may already be live.');
 console.log('Verified deployed release '+release+' at '+url);
}
