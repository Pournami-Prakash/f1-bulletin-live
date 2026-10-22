#!/usr/bin/env node
// Encrypted local backup and isolated Docker restore. No billable cloud storage.
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, chmodSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const require=createRequire(new URL('../web/package.json',import.meta.url));
require('@next/env').loadEnvConfig(fileURLToPath(new URL('../web/',import.meta.url)));
const started=Date.now();
const state=join(homedir(),'.local','share','f1-bulletin','backups');
const keys=join(homedir(),'.codex','private','f1-bulletin-backups');
mkdirSync(state,{recursive:true,mode:0o700});chmodSync(state,0o700);
mkdirSync(keys,{recursive:true,mode:0o700});chmodSync(keys,0o700);
const identity=join(keys,'identity.txt');
if(!(()=>{try{return statSync(identity).isFile()}catch{return false}})())execFileSync('age-keygen',['-o',identity],{stdio:'ignore'});
chmodSync(identity,0o600);
const recipient=execFileSync('age-keygen',['-y',identity],{encoding:'utf8'}).trim();
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const encrypted=join(state,`${stamp}.dump.age`);
const temporary=mkdtempSync(join(tmpdir(),'f1-restore-'));chmodSync(temporary,0o700);
const raw=join(temporary,'database.dump');
const container=`f1-restore-${randomBytes(6).toString('hex')}`;
const password=randomBytes(24).toString('hex');
let containerCreated=false;
const run=(command,args,options={})=>execFileSync(command,args,{stdio:['ignore','pipe','pipe'],timeout:300000,...options});
try{
 const url=new URL(process.env.NEON_DATABASE_URL);
 const pg={...process.env,PGHOST:url.hostname.replace('-pooler.','.'),PGPORT:url.port||'5432',PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGSSLMODE:'require',PGCONNECT_TIMEOUT:'15'};
 run('/opt/homebrew/opt/libpq@17/bin/pg_dump',['--format=custom','--no-owner','--no-acl','--lock-wait-timeout=10s',`--file=${raw}`],{env:pg});chmodSync(raw,0o600);
 run('age',['-r',recipient,'-o',encrypted,raw]);chmodSync(encrypted,0o600);
 const hash=createHash('sha256').update(readFileSync(encrypted)).digest('hex');
 writeFileSync(encrypted+'.sha256',`${hash}  ${encrypted.split('/').pop()}\n`,{mode:0o600});
 console.log(JSON.stringify({stage:'encrypted_local_backup_created',bytes:statSync(encrypted).size}));
 rmSync(raw);
 run('age',['-d','-i',identity,'-o',raw,encrypted]);chmodSync(raw,0o600);
 run('docker',['run','--detach','--name',container,'--network','none','--memory','1g','--cpus','2','--env','POSTGRES_PASSWORD','--env','POSTGRES_DB=restored','pgvector/pgvector:pg17'],{env:{...process.env,POSTGRES_PASSWORD:password}});containerCreated=true;
 let ready=false;
 for(let i=0;i<60;i++){
  const r=spawnSync('docker',['exec',container,'pg_isready','-U','postgres'],{stdio:'ignore',timeout:5000});
  if(r.status===0){ready=true;break;}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 if(!ready)throw new Error('Disposable database did not become ready');
 run('docker',['exec',container,'psql','-U','postgres','-d','restored','-v','ON_ERROR_STOP=1','-c','CREATE ROLE f1_web_reader NOLOGIN','-c','CREATE ROLE f1_app_writer NOLOGIN','-c','CREATE ROLE f1_rate_limiter NOLOGIN']);
 run('docker',['cp',raw,`${container}:/tmp/database.dump`]);
 run('docker',['exec',container,'pg_restore','-U','postgres','-d','restored','--no-owner','--no-acl','--exit-on-error','/tmp/database.dump']);
 const counts=run('docker',['exec',container,'psql','-U','postgres','-d','restored','-tA','-v','ON_ERROR_STOP=1','-c',"SELECT json_build_object('sessions',(SELECT COUNT(*) FROM public.sessions),'predictions',(SELECT COUNT(*) FROM public.predictions),'stories',(SELECT COUNT(*) FROM public.story_timeline),'migrations',(SELECT COUNT(*) FROM app_ops.schema_migrations))"],{encoding:'utf8'}).trim();
 const report={status:'isolated_restore_passed',counts:JSON.parse(counts),elapsedSeconds:Math.round((Date.now()-started)/1000),backupBytes:statSync(encrypted).size,sha256:hash,backupPath:encrypted};
 if(report.counts.sessions<1||report.counts.predictions<1||report.counts.stories<1)throw new Error('Restored data invariants failed');
 writeFileSync(join(state,`${stamp}.verification.json`),JSON.stringify(report,null,2)+'\n',{mode:0o600});
 console.log(JSON.stringify(report));
 // Upload key material only through stdin to the authorized repository secret.
 run('gh',['secret','set','BACKUP_IDENTITY','--repo','Pournami-Prakash/f1-bulletin-live'],{input:readFileSync(identity),stdio:['pipe','pipe','pipe']});
 run('gh',['variable','set','BACKUP_RECIPIENT','--body',recipient,'--repo','Pournami-Prakash/f1-bulletin-live']);
 console.log(JSON.stringify({backupKeys:'configured',scheduledCloudBackups:'disabled_for_zero_cost'}));
}catch(error){
 console.error(JSON.stringify({status:'local_backup_or_restore_failed',code:error.code??null,stage:containerCreated?'restore':'backup'}));process.exitCode=1;
}finally{
 if(containerCreated)run('docker',['rm','--force',container]);
 rmSync(temporary,{recursive:true,force:true});
}
