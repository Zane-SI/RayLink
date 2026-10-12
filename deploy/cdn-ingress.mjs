#!/usr/bin/env node
// Optional, independent WS ingress. Never edits RayLink's generated runtime.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [mode, sourcePath, settingsPath, outputPath] = process.argv.slice(2);
const unit = 'raylink-cdn.service';
const binary = '/usr/local/bin/raylink-sing-box';
let candidate;
function requireValue(condition, message) { if (!condition) throw new Error(message); }
function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 20000 });
  // Child output may contain credentials or request destinations. Keep it private.
  requireValue(!result.error && result.status === 0, `${command} failed`);
}
function render(source, settings) {
  const sources = (source.inbounds || []).filter(i => i.tag === settings.sourceTag);
  requireValue(sources.length === 1 && sources[0].type === 'vless', 'Expected one existing VLESS inbound');
  const inbound = sources[0];
  requireValue(['::', '0.0.0.0', '127.0.0.1'].includes(inbound.listen), 'Main VLESS must accept IPv4 loopback');
  requireValue(!inbound.transport && !inbound.tls?.reality?.enabled, 'Unsupported main VLESS transport');
  requireValue(inbound.tls?.enabled && inbound.tls.server_name, 'Verified main VLESS TLS is required');
  requireValue(Number.isInteger(settings.listenPort) && settings.listenPort > 1024 && settings.listenPort < 65536 && settings.listenPort !== inbound.listen_port, 'Invalid loopback port');
  requireValue(/^\/[a-f0-9]{32,64}$/.test(settings.path), 'Expected a random hexadecimal WS path');
  requireValue(Array.isArray(inbound.users), 'Missing source users');
  const users = inbound.users.map(u => ({ name: u.name, uuid: u.uuid }));
  requireValue(users.every(u => typeof u.name === 'string' && u.name.length && /^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(u.uuid)), 'Invalid source user');
  requireValue(new Set(users.map(u => u.name)).size === users.length && new Set(users.map(u => u.uuid)).size === users.length, 'Duplicate source user');
  requireValue(inbound.users.every(u => !u.flow), 'VLESS flow is incompatible with this WS adapter');
  const pem = inbound.tls.certificate_path ? readFileSync(inbound.tls.certificate_path, 'utf8') : (inbound.tls.certificate || []).join('\n');
  requireValue(pem.includes('-----BEGIN CERTIFICATE-----'), 'Missing main VLESS certificate');
  const outbounds = users.map(u => ({
    type: 'vless', tag: `user-${createHash('sha256').update(u.name).digest('hex').slice(0, 24)}`,
    server: '127.0.0.1', server_port: inbound.listen_port, uuid: u.uuid,
    tls: { enabled: true, server_name: inbound.tls.server_name, certificate: [pem] },
    connect_timeout: '10s', tcp_keep_alive: '30s',
  }));
  return {
    log: { level: 'warn', timestamp: true },
    inbounds: [{ type: 'vless', tag: 'raylink-cdn-ws', listen: '127.0.0.1', listen_port: settings.listenPort,
      users, transport: { type: 'ws', path: settings.path }, tcp_keep_alive: '30s' }],
    outbounds,
    route: { rules: [
      ...users.map((u, index) => ({ auth_user: [u.name], action: 'route', outbound: outbounds[index].tag })),
      { action: 'reject' },
    ] },
  };
}
try {
  requireValue(['render', 'sync'].includes(mode) && sourcePath && settingsPath && outputPath, 'Usage: cdn-ingress.mjs render|sync source.json settings.json output.json');
  requireValue(sourcePath !== outputPath && settingsPath !== outputPath, 'Output must be separate from the source');
  const sourceBytes = readFileSync(sourcePath, 'utf8');
  const config = render(JSON.parse(sourceBytes), JSON.parse(readFileSync(settingsPath, 'utf8')));
  const content = JSON.stringify(config, null, 2) + '\n';
  candidate = `${outputPath}.${randomUUID()}.tmp`;
  writeFileSync(candidate, content, { mode: 0o600, flag: 'wx' });
  if (mode === 'sync') run(binary, ['check', '-c', candidate]);
  requireValue(readFileSync(sourcePath, 'utf8') === sourceBytes, 'Source changed during generation; retry on next sync');
  let previous;
  try { previous = readFileSync(outputPath, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous !== content) {
    renameSync(candidate, outputPath);
    if (mode === 'sync') run('systemctl', ['restart', unit]);
  } else if (mode === 'sync') {
    run('systemctl', ['start', unit]);
  }
  console.log(JSON.stringify({ changed: previous !== content, users: config.inbounds[0].users.length }));
} catch (error) {
  if (mode === 'sync') spawnSync('systemctl', ['stop', unit], { timeout: 20000, stdio: 'ignore' });
  console.error(`CDN ingress: ${error instanceof SyntaxError ? 'invalid JSON' : error.code ? `I/O ${error.code}` : error.message}`);
  process.exitCode = 1;
} finally {
  if (candidate) rmSync(candidate, { force: true });
}
