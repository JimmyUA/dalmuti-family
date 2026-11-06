import {checkDeployment} from './smoke-check.mjs';

export const stagingOrigin='https://dalmuti-family-staging.sergii-pryhodko.workers.dev/';
export async function assertStagingRelease(release,fetcher=fetch){
 if(!/^[a-f0-9]{40}$/i.test(release||''))throw Error('Full staging release SHA required');
 await checkDeployment(stagingOrigin,release,fetcher,'staging');
 console.log('Current staging is healthy and serves approved release '+release);
}
export async function assertProductionDomain(release,fetcher=fetch){
 if(!/^[a-f0-9]{40}$/i.test(release||''))throw Error('Full production release SHA required');
 const url='https://crownturn.com/';
 const headers={'Cache-Control':'no-cache'};
 const health=await fetcher(url+'api/health?release='+release,{headers,signal:AbortSignal.timeout(10000)});
 const data=await health.json();
 if(health.status!==200||data.status!=='ok'||data.release!==release||!data.checks?.database||!data.checks?.rateLimits)throw Error('Production custom domain health or release SHA mismatch');
 const page=await fetcher(url,{headers,signal:AbortSignal.timeout(10000)});
 if(page.status!==200||!(await page.text()).includes('Crownturn'))throw Error('Production custom domain homepage failed');
 console.log('Verified production custom domain release '+release);
}
if(process.argv[1]?.endsWith('check-release-host.mjs')){
 const type=process.argv[2],release=process.argv[3];
 if(type==='staging')await assertStagingRelease(release);
 else if(type==='production')await assertProductionDomain(release);
 else throw Error('Choose staging or production check');
}
