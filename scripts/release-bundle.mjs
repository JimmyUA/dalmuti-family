import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,statSync,mkdirSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const sha40=/^[a-f0-9]{40}$/i;
const artifact='release/crownturn-build.tar.gz';
const manifestPath='release/manifest.json';
const sha256=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const runTar=args=>{
 const r=spawnSync('tar',args,{encoding:'utf8'});
 if(r.status!==0)throw Error('tar failed: '+r.stderr);
 return r.stdout;
};
export function validateManifest(manifest,expectedSha){
 if(!sha40.test(expectedSha||''))throw Error('Full release SHA is required');
 if(manifest?.format!==1||manifest.releaseSha!==expectedSha||!(/^[a-f0-9]{64}$/.test(manifest.sha256||''))||!Number.isSafeInteger(manifest.bytes)||manifest.bytes<1)throw Error('Invalid release manifest or wrong source commit');
 return manifest;
}
export function verifyBundle(expectedSha,expectedDigest=''){
 const manifest=validateManifest(JSON.parse(readFileSync(manifestPath,'utf8')),expectedSha);
 if(expectedDigest&&expectedDigest!==manifest.sha256)throw Error('Staging-approved artifact digest disagrees');
 if(statSync(artifact).size!==manifest.bytes||sha256(artifact)!==manifest.sha256)throw Error('Release artifact integrity check failed');
 const list=runTar(['-tzf',artifact]).trim().split('\n');
 if(!list.length||!list.some(s=>s==='dist/server/index.js')||!list.some(s=>s==='dist/server/wrangler.json')||!list.some(s=>s==='dist/client/index.html'))throw Error('Release archive is missing application files');
 for(const item of list){
  const parts=item.split('/').filter(Boolean);
  if(item.startsWith('/')||parts.includes('..')||parts[0]!=='dist'||!['client','server'].includes(parts[1]))throw Error('Release archive contains an unexpected path: '+item);
 }
 return manifest;
}
export function packBundle(sha){
 if(!sha40.test(sha||''))throw Error('A full Git source SHA is required');
 for(const p of ['dist/server/index.js','dist/server/wrangler.json','dist/client/index.html'])if(!existsSync(p))throw Error('Missing built file '+p);
 mkdirSync('release',{recursive:true});
 runTar(['--sort=name','--mtime=@0','--owner=0','--group=0','--numeric-owner','-czf',artifact,'dist']);
 const manifest={format:1,releaseSha:sha,sha256:sha256(artifact),bytes:statSync(artifact).size};
 writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 verifyBundle(sha);
 return manifest;
}
export function extractBundle(sha,digest=''){
 const manifest=verifyBundle(sha,digest);
 runTar(['--no-same-owner','--no-same-permissions','-xzf',artifact]);
 return manifest;
}
if(process.argv[1]?.endsWith('release-bundle.mjs')){
 const command=process.argv[2],sha=process.argv[3],digest=process.argv[4]||'';
 const result=command==='pack'?packBundle(sha):command==='verify'?verifyBundle(sha,digest):command==='extract'?extractBundle(sha,digest):null;
 if(!result)throw Error('Usage: release-bundle.mjs pack|verify|extract <git-sha> [expected-sha256]');
 console.log('Release artifact '+command+': '+result.releaseSha+' sha256='+result.sha256);
}
