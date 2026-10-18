import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.A11Y_PLAYWRIGHT_MODULE||'playwright');
const axe=readFileSync(process.env.A11Y_AXE_PATH||require.resolve('axe-core/axe.min.js'),'utf8');
const root=new URL('../dist/client',import.meta.url).pathname;
const server=createServer((req,res)=>{try{let path=new URL(req.url,'http://local').pathname;if(path==='/')path='/index.html';const data=readFileSync(root+path);res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.end(data)}catch{res.statusCode=404;res.end('Not found')}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({...(process.env.A11Y_CHROMIUM_PATH?{executablePath:process.env.A11Y_CHROMIUM_PATH}:{}),args:JSON.parse(process.env.A11Y_CHROMIUM_ARGS||'[]'),headless:true});
const id='11111111-1111-4111-8111-111111111111';
const results=[];
try{
 for(const [lang,phase,width] of [['en','welcome',320],['en','playing',320],['uk','playing',320],['nl','playing',320],['en','tax',390],['en','revolution',390],['en','results',1280],['en','lobby',390],['nl','privacy',320]]){
 const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();
 let game={code:'ABCDEF',host:id,round:1,version:1,phase,players:[{id,name:'Jimmy',hand:[3,3,7,13],count:4,presence:'online',score:3,wins:1},...['Oliver','Matilda','Emma'].map((name,i)=>({id:'seat-'+(i+1),name,hand:[],count:5,presence:'online',score:2,wins:0,bot:true}))],turn:0,last:1,pile:[4,4],finished:phase==='results'?[id,'seat-1','seat-2','seat-3']:[],tax:{},log:['Oliver played 2 × 4'],revolution:phase==='revolution'?id:undefined};
 if(phase==='lobby'){game.round=0;game.pile=[]}
 await page.addInitScript(({lang,id,phase})=>{localStorage.setItem('dalmuti-language',lang);localStorage.setItem('dalmuti-id',id);localStorage.setItem('dalmuti-name','Jimmy');if(!['welcome','privacy'].includes(phase))localStorage.setItem('dalmuti-room','ABCDEF')},{lang,id,phase});
 await page.route('**/api/game',async route=>{const body=route.request().postDataJSON();await route.fulfill({json:{...game,...(body.requestId?{acknowledgedRequestId:body.requestId}:{} )}})});
 await page.goto(origin+'/' +(phase==='privacy'?'privacy.html?lang=nl':''));
 if(!['welcome','privacy'].includes(phase))await page.locator('.board').waitFor();
 if(!(await page.title()).toUpperCase().includes('CROWNTURN'))throw Error('Missing Crownturn page identity');
 if(phase!=='privacy'&&(await page.locator('body').innerText()).match(/dalmut|далмут/i))throw Error('Old brand visible outside About');
 await page.evaluate(axe);const report=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa']}}));
 const overflow=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
 results.push({lang,phase,width,overflow,violations:report.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
 if(phase==='playing'&&lang==='en'){
 await page.keyboard.press('Tab');const first=await page.evaluate(()=>document.activeElement.className);if(first!=='skip-link')throw Error('Skip link not first keyboard stop');await page.keyboard.press('Enter');if(await page.evaluate(()=>document.activeElement.id)!=='game-content')throw Error('Skip link does not focus game');
 const c=page.locator('.card').first();await c.focus();await page.keyboard.press('Space');if(await c.getAttribute('aria-pressed')!=='true')throw Error('Keyboard card selection failed');if(await page.locator('.table-action').isEnabled())throw Error('Partial set enabled Play');await page.locator('.card').nth(1).focus();await page.keyboard.press('Enter');if(!await page.locator('.table-action').isEnabled())throw Error('Valid keyboard set disabled Play');await page.locator('.clear-selection').click();
 await page.getByRole('button',{name:/Room ABCDEF/}).click();await page.locator('.toast button').focus();await page.keyboard.press('Enter');if(await page.locator('.toast').count())throw Error('Keyboard dismissal failed');
 await page.emulateMedia({reducedMotion:'reduce'});if(await c.evaluate(el=>getComputedStyle(el).transitionDuration)!=='0s')throw Error('Reduced motion ignored');
 if(process.env.A11Y_SCREENSHOT_PREFIX)await page.screenshot({path:process.env.A11Y_SCREENSHOT_PREFIX+'-playing.png',fullPage:true});
 }
 if(phase==='welcome'){
 await page.getByRole('button',{name:'How to play'}).click();
 const about=page.getByText('About Crownturn',{exact:true});await about.focus();await page.keyboard.press('Enter');
 if(!await page.getByRole('link',{name:'Original game’s rulebook (opens in a new tab)'}).isVisible())throw Error('About reference not reachable by keyboard');
 await page.keyboard.press('Escape');
 }
 if(phase==='welcome'&&process.env.A11Y_SCREENSHOT_PREFIX)await page.screenshot({path:process.env.A11Y_SCREENSHOT_PREFIX+'-welcome.png',fullPage:true});
 await context.close();
 }
 if(process.env.A11Y_REPORT_PATH)writeFileSync(process.env.A11Y_REPORT_PATH,JSON.stringify(results,null,2));
 const failures=results.filter(r=>r.violations.length||r.overflow.scroll>r.overflow.client);if(failures.length)throw Error(JSON.stringify(failures,null,2));
 console.log('Passed: '+results.length+' browser accessibility scans, mobile reflow, keyboard selection/dismissal/skip link and reduced motion.');
}finally{await browser.close();server.close()}
