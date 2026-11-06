import assert from 'node:assert/strict';

export const monitored=[
 {name:'production',origin:'https://crownturn.com',staging:false},
 {name:'staging',origin:'https://dalmuti-family-staging.sergii-pryhodko.workers.dev',staging:true},
];
const sha=/^[a-f0-9]{40}$/i;
export async function probe(target,fetcher=fetch){
 if(!monitored.some(x=>x.origin===target.origin&&x.name===target.name&&x.staging===target.staging))throw Error('Refusing unknown monitor endpoint');
 const headers={'Cache-Control':'no-cache'};
 const get=async path=>fetcher(target.origin+path,{headers,signal:AbortSignal.timeout(10000)});
 const health=await get('/api/health');
 assert.equal(health.status,200,target.name+' health HTTP status');
 const data=await health.json();
 assert.equal(data.status,'ok',target.name+' status');
 assert(data.checks?.database&&data.checks?.rateLimits,target.name+' D1 or rate limits unhealthy');
 assert(sha.test(data.release||''),target.name+' full release SHA missing');
 assert.equal(health.headers.get('X-Release-SHA'),data.release,target.name+' release header mismatch');
 const page=await get('/');
 assert.equal(page.status,200,target.name+' home HTTP status');
 assert((await page.text()).includes('Crownturn'),target.name+' homepage identity');
 if(target.staging){
  for(const response of [health,page]){
   assert.equal(response.headers.get('X-Crownturn-Environment'),'staging','Staging identity header missing');
   assert.equal(response.headers.get('X-Robots-Tag'),'noindex, nofollow','Staging noindex missing');
  }
 }else{
  assert.notEqual(health.headers.get('X-Crownturn-Environment'),'staging','Production points to staging');
  assert.notEqual(page.headers.get('X-Crownturn-Environment'),'staging','Production page points to staging');
 }
 return {name:target.name,release:data.release};
}
export async function monitorBoth(fetcher=fetch){
 const results=[];
 for(const target of monitored){
  let error;
  for(let attempt=0;attempt<3;attempt++){
   try{results.push(await probe(target,fetcher));error=null;break}
   catch(e){error=e;if(attempt<2)await new Promise(resolve=>setTimeout(resolve,(attempt+1)*2000))}
  }
  if(error)throw new Error('Crownturn '+target.name+' monitoring failed: '+error.message);
 }
 return results;
}
if(process.argv[1]?.endsWith('monitor-endpoints.mjs')){
 const results=await monitorBoth();
 for(const result of results)console.log('Healthy '+result.name+' release '+result.release);
}
