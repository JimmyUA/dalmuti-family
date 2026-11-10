import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';

const source=readFileSync('app/invite-sharing.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {createInvite,shareInvite,copyInvite}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));

const origin='https://dalmuti-family-staging.example.workers.dev';
const room='aBc123';
for(const lang of ['en','nl','uk']){
  const invite=createInvite(origin,room,lang);
  assert.equal(invite.title,'Crownturn');
  assert.equal(invite.url,origin+'/?room=ABC123');
  assert(invite.text.includes('Crownturn'));
  assert(!invite.text.includes(room));
  assert.deepEqual(Object.keys(invite).sort(),['text','title','url']);
}
assert.match(createInvite(origin,room,'nl').text,/Speel/);
assert.match(createInvite(origin,room,'uk').text,/Зіграємо/);
assert.match(createInvite(origin,room,'en').text,/Come play/);
assert.equal(createInvite('https://crownturn.com/example/path',room,'en').url,'https://crownturn.com/?room=ABC123');
for(const bad of ['', 'abc', 'abcdefgh', 'A&B?12', 'ab c12','ABC123/secret'])assert.throws(()=>createInvite(origin,bad,'en'),/Invalid room code/);

const invite=createInvite(origin,room,'en');
let shareCount=0,copyCount=0;
const native=async payload=>{shareCount++;assert.deepEqual(payload,invite);};
const clipboard=async value=>{copyCount++;assert.equal(value,invite.url);};
assert.equal(await shareInvite(invite,native,clipboard),'shared');
assert.equal(shareCount,1);
assert.equal(copyCount,0,'successful native sharing must not also copy');
assert.equal(await copyInvite(invite.url,clipboard),'copied');
assert.equal(copyCount,1,'copy is always a separate option');
assert.equal(await shareInvite(invite,undefined,clipboard),'copied','unsupported native sharing falls back to clipboard');
assert.equal(copyCount,2);
assert.equal(await shareInvite(invite,async()=>{throw Object.assign(new Error('user cancelled'),{name:'AbortError'});},clipboard),'cancelled');
assert.equal(copyCount,2,'cancellation must not silently copy');
assert.equal(await shareInvite(invite,async()=>{throw Object.assign(new Error('blocked'),{name:'NotAllowedError'});},clipboard),'copied');
assert.equal(copyCount,3,'blocked native API falls back to clipboard');
assert.equal(await shareInvite(invite,async()=>{throw Error('share failed');},async()=>{throw Error('clipboard denied');}),'manual');
assert.equal(await shareInvite(invite,undefined,undefined),'manual');
assert.equal(await copyInvite(invite.url,async()=>{throw Error('denied');}),'manual');

const ui=readFileSync('app/invite-controls.tsx','utf8');
const page=readFileSync('app/page.tsx','utf8');
const css=readFileSync('app/globals.css','utf8');
const growth=readFileSync('app/growth.ts','utf8');
assert.match(page,/g\.phase==='lobby'&&<InviteControls/,'lobby action next to seats');
assert.match(page,/g\.phase==='lobby'\?<span className="invite-room-code"/,'lobby room code remains visible');
assert.match(page,/<InviteControls key=\{g\.code\} code=\{g\.code\} lang=\{lang\} testMode=\{g\.testMode\} showCode\/>/,'play uses compact header');
assert.match(ui,/nativeShare && <button/,'native sharing must be feature-detected');
assert.match(ui,/className="outline invite-copy"/,'copy is always available');
assert.match(ui,/referrerPolicy|sendGrowth\('invite_shared'|sendGrowth\('invite_copied'/);
assert.match(ui,/setManualUrl\(result === 'manual'/,'show selectable link if clipboard denied');
assert.match(ui,/readOnly value=\{manualUrl\}/,'read-only manual copy link');
assert.match(ui,/event\.currentTarget\.select\(\)/,'tap to select manual link');
assert.match(ui,/!testMode && result === 'shared'/,'test rooms do not count native share actions');
assert.match(ui,/!testMode && result === 'copied'/,'test rooms do not count copied invites');
assert.match(css,/\.lobby-invite-controls/);
assert.match(css,/@media\(max-width:480px\)/);
assert.match(growth,/'invite_shared'/,'server allowlist includes native share action');
for(const language of ['app/dutch.ts','app/i18n.ts']){
  const dictionary=readFileSync(language,'utf8');
  for(const key of ['Share invitation','Copy link','Copy invitation','Invitation link copied!','Invitation link to copy manually'])assert(dictionary.includes('"'+key+'"'),language+' missing '+key);
}
console.log('Passed: localized invitations, canonical URLs, native share, cancellation, clipboard denial, manual fallback, analytics and responsive invite placements.');
