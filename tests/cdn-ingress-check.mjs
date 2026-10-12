// Native acceptance at the existing protocol/authentication/usage boundary.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { queryV2RayUserStats, normalizeV2RayUserStats } from '../server/usage/v2ray-stats.js';
const bin = process.env.SING_BOX_BIN || 'sing-box';
const dir = await mkdtemp(join(tmpdir(), 'raylink-cdn-check-'));
const children = new Set();
const target = createServer((req, res) => res.end('cdn-usage-test-'.repeat(8192)));
const payload = 'cdn-usage-test-'.repeat(8192);
const sourcePath = join(dir, 'source.json');
const settingsPath = join(dir, 'settings.json');
const sidecarPath = join(dir, 'sidecar.json');
const cert = join(dir, 'cert.pem'), key = join(dir, 'key.pem');
async function port() { const s = tcpServer(); s.listen(0, '127.0.0.1'); await once(s,'listening'); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
async function start(name, config) {
 const file=join(dir, name+'.json'); await writeFile(file, JSON.stringify({ ...config, log: { level: 'info' } }));
 execFileSync(bin,['check','-c',file],{stdio:'pipe'});
 const child=spawn(bin,['run','-c',file],{stdio:['ignore','pipe','pipe']}); children.add(child);
 let log=''; child.stdout.on('data',b=>log+=b); child.stderr.on('data',b=>log+=b);
 for(let i=0;i<100;i++){ if(log.includes('sing-box started'))return child; if(child.exitCode!==null)break; await delay(30); }
 throw new Error(name+' failed to start: '+log);
}
async function stop(child) { if(!child || child.exitCode!==null || child.signalCode!==null)return; const done=once(child,'exit'); child.kill('SIGTERM'); await done; children.delete(child); }
async function transfer(clientPort) {
 const child=spawn('curl',['--silent','--show-error','--fail','--noproxy','','--max-time','4','--socks5-hostname',`127.0.0.1:${clientPort}`,`http://127.0.0.1:${target.address().port}/`],{stdio:['ignore','pipe','pipe']});
 let body='';child.stdout.on('data',b=>body+=b);const [code]=await once(child,'exit');if(code!==0)throw new Error('transfer rejected');return body;
}
function render() { execFileSync(process.execPath,['deploy/cdn-ingress.mjs','render',sourcePath,settingsPath,sidecarPath],{stdio:'pipe'}); }
try {
 assert.match(execFileSync(bin,['version'],{encoding:'utf8'}),/with_v2ray_api/);
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=node.example.com','-addext','subjectAltName=DNS:node.example.com'],{stdio:'ignore'});
 const mainPort=await port(), wsPort=await port(), statsPort=await port();
 const users=[{name:'test-a',uuid:randomUUID()},{name:'test-b',uuid:randomUUID()}];
 const main={log:{level:'info'},inbounds:[{type:'vless',tag:'raylink-vless',listen:'127.0.0.1',listen_port:mainPort,users,tls:{enabled:true,server_name:'node.example.com',certificate_path:cert,key_path:key}}],outbounds:[{type:'direct',tag:'direct'}],experimental:{v2ray_api:{listen:`127.0.0.1:${statsPort}`,stats:{enabled:true,users:users.map(u=>u.name)}}}};
 await writeFile(sourcePath,JSON.stringify(main)); const original=await readFile(sourcePath,'utf8');
 await writeFile(settingsPath,JSON.stringify({sourceTag:'raylink-vless',listenPort:wsPort,path:'/d302886025145aecfa439d192d6ad679'}));
 render(); assert.equal(await readFile(sourcePath,'utf8'),original,'render must not edit the main runtime');
 const first=await readFile(sidecarPath,'utf8');render();assert.equal(await readFile(sidecarPath,'utf8'),first,'render is deterministic');
 target.listen(0,'127.0.0.1');await once(target,'listening');
 let server=await start('main',main); await start('sidecar',JSON.parse(first));
 async function requestAs(user,path='/d302886025145aecfa439d192d6ad679') {
  const p=await port();const c=await start('client-'+p,{log:{level:'info'},inbounds:[{type:'socks',listen:'127.0.0.1',listen_port:p}],outbounds:[{type:'vless',tag:'cdn',server:'127.0.0.1',server_port:wsPort,uuid:user.uuid,transport:{type:'ws',path}}]});
  try{return await transfer(p);}finally{await stop(c);}
 }
 assert.equal(await requestAs(users[0]),payload);
 let counters=normalizeV2RayUserStats(await queryV2RayUserStats({endpoint:`http://127.0.0.1:${statsPort}`}));
 assert.ok(counters.find(s=>s.name==='test-a')?.downlinkBytes>=payload.length,'usage charged to authenticated user');
 assert.ok(!counters.find(s=>s.name==='test-b')?.downlinkBytes,'other user not charged');
 assert.equal(await requestAs(users[1]),payload);
 counters=normalizeV2RayUserStats(await queryV2RayUserStats({endpoint:`http://127.0.0.1:${statsPort}`}));
 assert.ok(counters.find(s=>s.name==='test-b')?.downlinkBytes>=payload.length);
 await assert.rejects(()=>requestAs({uuid:randomUUID()}));
 await assert.rejects(()=>requestAs(users[0],'/wrong-path'));
 await stop(server); server=await start('revoked-main',{...main,inbounds:[{...main.inbounds[0],users:[users[1]]}]});
 await assert.rejects(()=>requestAs(users[0]),'revocation enforced even before sidecar sync');
 assert.equal(await requestAs(users[1]),payload);
 await writeFile(sourcePath,JSON.stringify({...main,inbounds:[]}));
 assert.throws(render,'missing main inbound must fail closed');
 console.log(JSON.stringify({websocket:true,perUserMetering:true,userIsolation:true,invalidUuidRejected:true,wrongPathRejected:true,revocation:true,sourceUnchanged:true,missingSourceRejected:true}));
} finally { await Promise.all([...children].map(stop)); if(target.listening)await new Promise(r=>target.close(r));await rm(dir,{recursive:true,force:true}); }
