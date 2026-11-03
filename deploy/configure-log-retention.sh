#!/usr/bin/env bash
# Apply bounded host logging on a systemd control-plane Host. Does not restart
# RayLink, sing-box, CDN or Caddy. Run explicitly during maintenance.
set -Eeuo pipefail
umask 077
[ "$(id -u)" = 0 ] || { printf '%s\n' 'Root is required.' >&2; exit 1; }
command -v journalctl >/dev/null
command -v logrotate >/dev/null
retention_backup="/var/backups/raylink/$(date -u +%Y%m%dT%H%M%SZ)-log-retention"
install -d -m 0700 "$retention_backup" /etc/systemd/journald.conf.d
retention_journal=/etc/systemd/journald.conf.d/60-raylink-retention.conf
retention_syslog=/etc/logrotate.d/rsyslog
for retention_file in "$retention_journal" "$retention_syslog"; do
  if [ -f "$retention_file" ]; then cp -a "$retention_file" "$retention_backup/$(basename "$retention_file")"; fi
done
cat > "$retention_backup/journal.candidate" <<'JOURNAL'
[Journal]
SystemMaxUse=512M
RuntimeMaxUse=64M
SystemKeepFree=2G
MaxRetentionSec=7day
MaxFileSec=1day
JOURNAL
if [ -f "$retention_syslog" ]; then
  python3 - "$retention_syslog" "$retention_backup/rsyslog.candidate" <<'PY'
import pathlib,re,sys
p=pathlib.Path(sys.argv[1]);text=p.read_text()
# Only the distro stanza owning syslog, never add a duplicate ownership stanza.
match=re.search(r'(?m)^/var/log/syslog\s*\n[^{}]*\{[^{}]*\}',text)
if not match:raise SystemExit('Unrecognized rsyslog rotation layout; review manually')
block=match.group()
block=re.sub(r'(?m)^\s*(daily|weekly|monthly)\s*$', '\tdaily',block)
block=re.sub(r'(?m)^\s*rotate\s+\d+\s*$', '\trotate 7',block)
block=re.sub(r'(?m)^\s*maxsize\s+\S+\s*\n','',block)
block=block.replace('{','{\n\tmaxsize 100M',1)
pathlib.Path(sys.argv[2]).write_text(text[:match.start()]+block+text[match.end():])
PY
  logrotate --debug "$retention_backup/rsyslog.candidate" > "$retention_backup/logrotate-validation.log" 2>&1
fi
install -m 0644 "$retention_backup/journal.candidate" "$retention_journal"
if [ -f "$retention_backup/rsyslog.candidate" ]; then
  install -m 0644 "$retention_backup/rsyslog.candidate" "$retention_syslog"
fi
systemctl restart systemd-journald
systemctl is-active --quiet systemd-journald
journalctl --rotate --vacuum-size=512M > "$retention_backup/journal-maintenance.log" 2>&1
if [ -f "$retention_syslog" ]; then
  # Compress rotated archives with low CPU/I/O priority; preserve their content.
  nice -n 19 ionice -c 3 logrotate --force "$retention_syslog" > "$retention_backup/rotation.log" 2>&1
fi
printf 'Log retention configured. Record: %s\n' "$retention_backup"
journalctl --disk-usage
df -h /
