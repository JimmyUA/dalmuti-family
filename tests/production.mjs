import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../dist/server/index.js';
const config=JSON.parse(readFileSync('dist/server/wrangler.json','utf8'));
assert.deepEqual(config.assets.run_worker_first,['/api/*']);
assert.equal(config.assets.binding,'ASSETS');
assert.deepEqual(config.triggers.crons,['*/15 * * * *']);
assert.equal(typeof worker.scheduled,'function');
const page=readFileSync('dist/client/index.html','utf8');
assert.match(page,/DALMUTI/);assert.match(page,/type="module"/);
let assetCalls=0;
const env={ASSETS:{fetch:async()=>{assetCalls++;return new Response('static')}},NETWORK_LIMIT:{limit:async()=>({success:true})},SESSION_LIMIT:{},CREATE_LIMIT:{},JOIN_LIMIT:{},DB:{prepare:()=>({first:async()=>({rooms:0,presence:0})})}};
assert.equal(await (await worker.fetch(new Request('https://game.test/'),env)).text(),'static');
assert.equal((await worker.fetch(new Request('https://game.test/api/game'),env)).status,405);
assert.equal((await worker.fetch(new Request('https://game.test/api/unknown'),env)).status,404);
const health=await worker.fetch(new Request('https://game.test/api/health'),env);
assert.equal(health.status,200);assert.equal((await health.json()).status,'ok');
const rejected=await worker.fetch(new Request('https://game.test/api/game',{method:'POST',headers:{Origin:'https://other.test','Content-Type':'application/json'},body:'{}'}),env);
assert.equal(rejected.status,403);assert.equal(assetCalls,1);
console.log('Passed: static asset configuration, direct API routing, health and cross-site protection.');

// Privacy is a static asset: no game session, database or rate-limit bindings needed.
const privacy=readFileSync('dist/client/privacy.html','utf8');
assert.match(privacy,/<article id="en" lang="en">/);
assert.match(privacy,/<article id="uk" lang="uk">/);
assert.match(privacy,/<article id="nl" lang="nl">/);
assert(!/<script[^>]+src=/.test(privacy));
assert.equal(await (await worker.fetch(new Request('https://game.test/privacy.html?lang=uk'),{ASSETS:{fetch:async request=>{assert.equal(new URL(request.url).pathname,'/privacy.html');return new Response(privacy)}}})).text(),privacy);
const {runInNewContext}=await import('node:vm');
const {privacyContent}=await import('../scripts/privacy-page.mjs');
function privacyLanguage(query,saved,browser,storageFails=false){
 const articles=Object.keys(privacyContent).map(lang=>({lang,hidden:false}));
 const links=articles.map(a=>({dataset:{lang:a.lang},setAttribute(name,value){this[name]=value}}));
 const document={documentElement:{},querySelectorAll:selector=>selector==='article'?articles:links,querySelector:()=>({textContent:privacyContent[articles.find(a=>!a.hidden).lang].title})};
 const code=privacy.match(/<script>([\s\S]*?)<\/script>/)[1];
 runInNewContext(code,{document,location:{search:query},navigator:{language:browser},URLSearchParams,localStorage:{getItem:key=>{assert.equal(key,'dalmuti-language');if(storageFails)throw Error('Storage blocked');return saved}}});
 const selected=articles.filter(a=>!a.hidden);assert.equal(selected.length,1);assert.equal(links.filter(a=>a['aria-current']==='page').length,1);
 assert.equal(document.documentElement.lang,selected[0].lang);return selected[0].lang;
}
assert.equal(privacyLanguage('?lang=uk','nl','en'), 'uk');
assert.equal(privacyLanguage('','nl','en'), 'nl');
assert.equal(privacyLanguage('?lang=invalid',null,'uk-UA',true),'uk');
assert.equal(privacyLanguage('',null,'fr-FR',true),'en');
console.log('Passed: static privacy page, three languages, language preference and blocked-storage fallback.');
