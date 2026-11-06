import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync} from 'node:fs';
import {stagingOrigin} from './staging-api-e2e.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CROWNTURN_PLAYWRIGHT_MODULE||'playwright');
const origin=stagingOrigin(process.env.CROWNTURN_E2E_URL);
const browser=await chromium.launch({headless:true});
const errors=[];
const diagnosticDir=process.env.CROWNTURN_E2E_SCREENSHOTS;
let hostPage,guestPage;
const observed=(page,label)=>page.on('pageerror',error=>errors.push(label+': '+error.message));
const wait=async(page,selector,n,ms=20000)=>page.waitForFunction(({selector,n})=>document.querySelectorAll(selector).length===n,{selector,n},{timeout:ms});
async function checkLayout(page,label){
 const info=await page.evaluate(()=>({
  viewport:document.documentElement.clientWidth,
  content:document.documentElement.scrollWidth,
  seats:document.querySelectorAll('.seat').length,
  cards:document.querySelectorAll('.card').length,
  stage:!!document.querySelector('.table-stage'),
 }));
 if(info.content>info.viewport+2)throw Error(label+' has horizontal overflow: '+JSON.stringify(info));
 assert.equal(info.seats,8,label+' player list');
 assert(info.stage,label+' table stage missing');
 return info;
}
try{
 const mobile={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
 const host=await browser.newContext(mobile);
 const guest=await browser.newContext(mobile);
 hostPage=await host.newPage();guestPage=await guest.newPage();
 observed(hostPage,'host');observed(guestPage,'guest');
 for(const page of [hostPage,guestPage])await page.addInitScript(()=>localStorage.setItem('dalmuti-language','en'));
 await hostPage.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await hostPage.locator('.entry input').first().fill('E2E Mobile Host');
 await hostPage.getByRole('button',{name:/Create a family room/}).click();
 await hostPage.locator('.roomtop button b').waitFor({timeout:20000});
 const code=(await hostPage.locator('.roomtop button b').innerText()).trim();
 assert.match(code,/^[A-F0-9]{6}$/);
 await guestPage.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await guestPage.locator('.entry input').first().fill('E2E Mobile Guest');
 await guestPage.locator('.code-input').fill(code);
 await guestPage.getByRole('button',{name:/Join room/}).click();
 await wait(guestPage,'.seat',2);
 await wait(hostPage,'.seat',2);
 for(let i=0;i<6;i++){
  await hostPage.getByRole('button',{name:'Add computer player'}).click();
  await wait(hostPage,'.seat',i+3);
 }
 await wait(guestPage,'.seat',8,25000);
 await checkLayout(hostPage,'host-390');
 await checkLayout(guestPage,'guest-390');
 await hostPage.setViewportSize({width:320,height:740});
 await guestPage.setViewportSize({width:320,height:740});
 await checkLayout(hostPage,'host-320');
 await checkLayout(guestPage,'guest-320');
 assert.equal(await hostPage.getByRole('button',{name:'Add computer player'}).isDisabled(),true,'8-player room must be full');
 await hostPage.getByRole('button',{name:/Deal the cards/}).click();
 await hostPage.locator('.seat-rank').first().waitFor({timeout:20000});
 await wait(hostPage,'.seat-rank',8);
 assert((await hostPage.locator('.hand .card').count())>0,'Dealt hand must be visible');
 await hostPage.locator('.score-chip').click();
 const dialog=hostPage.locator('dialog.table-dialog[open]');
 await dialog.waitFor();
 await wait(hostPage,'.cumulative-scores .score',8);
 await dialog.getByRole('button',{name:'Close panel'}).click();
 await hostPage.locator('button.round-chip:not(.score-chip)').click();
 assert(await dialog.getByText(/ROUND 1/i).count(),'Round information dialog unavailable');
 await dialog.getByRole('button',{name:'Close panel'}).click();
 await hostPage.reload({waitUntil:'domcontentloaded'});
 await hostPage.locator('.roomtop button b').waitFor({timeout:25000});
 assert.equal((await hostPage.locator('.roomtop button b').innerText()).trim(),code,'Refresh must restore same room');
 await wait(hostPage,'.seat',8);
 assert.equal(await hostPage.locator('.seat.is-me').count(),1,'Refresh must restore exactly one owned seat');
 await checkLayout(hostPage,'restored-host-320');
 await guestPage.reload({waitUntil:'domcontentloaded'});
 await wait(guestPage,'.seat',8,25000);
 assert.equal(await guestPage.locator('.seat.is-me').count(),1,'Guest reconnect must restore seat');
 assert.equal((await guestPage.locator('.roomtop button b').innerText()).trim(),code);
 await checkLayout(guestPage,'restored-guest-320');
 assert.equal(errors.length,0,'Uncaught browser errors: '+errors.join('; '));
 console.log('Passed: two real Chromium clients, mobile 320/390px, 8-player lobby, scores, round status, and reconnects.');
} catch(error){
 if(diagnosticDir){
  mkdirSync(diagnosticDir,{recursive:true});
  for(const [page,label] of [[hostPage,'host'],[guestPage,'guest']]){
   try{if(page&&!page.isClosed())await page.screenshot({path:diagnosticDir+'/'+label+'-failure.png',fullPage:true,timeout:5000})}catch{}
  }
 }
 throw error;
} finally{
 await browser.close();
}
