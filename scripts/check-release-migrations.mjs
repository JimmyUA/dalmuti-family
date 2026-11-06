import {readdirSync,readFileSync} from 'node:fs';

export function migrationRisks(name,sql){
 const risks=[];
 const normalized=sql.replace(/\/\*[\s\S]*?\*\//g,'').replace(/--[^\n]*/g,'').toUpperCase();
 if(/\b(DROP|DELETE|UPDATE|INSERT|REPLACE|TRUNCATE|VACUUM|PRAGMA|ATTACH|DETACH)\b/.test(normalized))risks.push('destructive or data-changing statement');
 if(/\bALTER\s+TABLE\b/.test(normalized)&&!/\bALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN\b/.test(normalized))risks.push('non-additive ALTER TABLE');
 if(/\bALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN[^;]*\bNOT\s+NULL\b/.test(normalized)&&!/\bALTER\s+TABLE\s+\S+\s+ADD\s+COLUMN[^;]*\bDEFAULT\b/.test(normalized))risks.push('NOT NULL column without a default');
 return risks;
}
export function verifyMigrations(directory='drizzle'){
 // Known legacy migrations (0000-0002) are already applied in production.
 // New migrations must be additive; SQL inspection does NOT prove room JSON compatibility.
 const candidates=readdirSync(directory).filter(name=>/^\d+_.+\.sql$/.test(name)&&Number(name.split('_')[0])>2);
 for(const name of candidates){
  const risks=migrationRisks(name,readFileSync(directory+'/'+name,'utf8'));
  if(risks.length)throw Error('Unsafe production migration '+name+': '+risks.join(', ')+'. Require a separately reviewed migration plan.');
 }
 console.log('Static additive-migration guard passed for '+candidates.length+' new migration(s). Manual room-state compatibility review is still required.');
}
if(process.argv[1]?.endsWith('check-release-migrations.mjs'))verifyMigrations();
