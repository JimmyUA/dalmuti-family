import {readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {verifyBundle} from './release-bundle.mjs';

const sha40=/^[a-f0-9]{40}$/i;
const uuid=/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const digits=/^[1-9]\d{0,17}$/;
const proofFile='proof/staging.json';
export function validateProof(proof,release,stageRun,manifest){
 if(proof?.format!==1||proof.releaseSha!==release||!sha40.test(release)||String(proof.stagingRunId)!==String(stageRun)||!digits.test(String(stageRun))||!digits.test(String(proof.ciRunId))||!uuid.test(proof.workerVersion||''))throw Error('Staging attestation identifies the wrong release or workflow run');
 if(proof.worker!=='dalmuti-family-staging'||proof.artifactSha256!==manifest.sha256)throw Error('Staging attestation has an unexpected Worker or artifact digest');
 return proof;
}
export function createProof({sha,ciRunId,stagingRunId,deployLog}){
 const manifest=verifyBundle(sha);
 if(!digits.test(String(ciRunId))||!digits.test(String(stagingRunId)))throw Error('Missing CI or staging run ID');
 const version=deployLog.match(/Current Version ID:\s*([a-f0-9-]{36})/i)?.[1];
 if(!uuid.test(version||'')||!deployLog.includes('Verified staging release '+sha+' at https://dalmuti-family-staging.'))throw Error('A verified staging deployment log is required for attestation');
 const proof={format:1,releaseSha:sha,artifactSha256:manifest.sha256,ciRunId:String(ciRunId),stagingRunId:String(stagingRunId),worker:'dalmuti-family-staging',workerVersion:version};
 validateProof(proof,sha,stagingRunId,manifest);
 mkdirSync('proof',{recursive:true});
 writeFileSync(proofFile,JSON.stringify(proof,null,2)+'\n');
 return proof;
}
export function readProof(release,stagingRunId){
 const manifest=verifyBundle(release);
 return validateProof(JSON.parse(readFileSync(proofFile,'utf8')),release,stagingRunId,manifest);
}
if(process.argv[1]?.endsWith('staging-proof.mjs')){
 const mode=process.argv[2];
 let proof;
 if(mode==='record')proof=createProof({sha:process.argv[3],ciRunId:process.argv[4],stagingRunId:process.argv[5],deployLog:readFileSync(process.argv[6],'utf8')});
 else if(mode==='verify')proof=readProof(process.argv[3],process.argv[4]);
 else throw Error('Usage: staging-proof.mjs record <release-sha> <ci-run-id> <staging-run-id> <deployment-log> | verify <release-sha> <staging-run-id>');
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,'ci_run_id='+proof.ciRunId+'\nartifact_sha256='+proof.artifactSha256+'\n');
 console.log('Staging attestation '+mode+' verified: '+proof.releaseSha+' / '+proof.workerVersion);
}
