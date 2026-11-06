import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Phase 0 safety invariant: the normal CI workflow must never write to production.
// Deployment and recovery get dedicated, gated workflows in later phases.
const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
const recovery = readFileSync('.github/workflows/recovery.yml', 'utf8');

assert.match(ci, /\bon:\s*\n\s+push:/);
assert.match(ci, /\bpull_request:\s*\n\s+branches:\s*\[main\]/);
assert.match(ci, /\bcontents:\s*read\b/);

for (const [description, pattern] of [
  ['the legacy production deploy toggle', /DEPLOY_ENABLED/],
  ['Cloudflare credentials or IDs', /CLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID|D1_DATABASE_ID)/],
  ['direct Wrangler deploy or remote migration', /\bwrangler\s+(?:deploy|d1\s+migrations\s+apply|versions\s+deploy)\b/i],
  ['production deploy preparation', /prepare-cloudflare-deploy\.mjs/],
  ['production deploy smoke check', /scripts\/smoke-check\.mjs/],
  ['production deploy workflow step', /^\s*- name:.*Deploy production/im],
  ['production release concurrency group', /crownturn-production/],
]) {
  assert.doesNotMatch(ci, pattern, `CI must not contain ${description}`);
}

// Recovery remains a manual, serialized operation with its existing guard tests.
assert.match(recovery, /\bworkflow_dispatch:/);
assert.match(recovery, /group:\s*crownturn-production/);
assert.match(recovery, /cancel-in-progress:\s*false/);
assert.match(recovery, /run:\s*node scripts\/recover-production\.mjs/);
assert.match(ci, /node tests\/recovery\.mjs/);

console.log('Passed: normal CI is check-only and manual production recovery remains configured.');
