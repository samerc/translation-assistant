# Translation Assistant — MariaDB backup with rotation.
# Runs mysqldump, compresses the dump, and prunes backups older than the retention window.
# Intended to run nightly via a Windows Scheduled Task (see the schtasks command at the bottom).
#
# Password resolution order: $env:DB_BACKUP_PASSWORD, else the default below.

$ErrorActionPreference = 'Stop'

$MysqlDump     = 'C:\Program Files\MariaDB 11.4\bin\mysqldump.exe'
$BackupDir     = 'C:\apps\translation-assistant\db-backups'
$RetentionDays = 14
$DbHost        = 'localhost'
$DbPort        = '33777'
$DbUser        = 'translation_user'
$DbName        = 'translation_assistant'
$DbPass        = if ($env:DB_BACKUP_PASSWORD) { $env:DB_BACKUP_PASSWORD } else { 'translation_pass' }

if (-not (Test-Path $MysqlDump)) { throw "mysqldump not found at $MysqlDump" }
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$out   = Join-Path $BackupDir "translation_assistant-$stamp.sql"

# --result-file writes the dump directly (avoids PowerShell stdout re-encoding).
& $MysqlDump -h $DbHost -P $DbPort -u $DbUser "-p$DbPass" `
  --single-transaction --routines --events --result-file="$out" $DbName
if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }

Compress-Archive -Path $out -DestinationPath "$out.zip" -Force
Remove-Item $out -Force

# Rotate: drop archives older than the retention window.
Get-ChildItem $BackupDir -Filter '*.sql.zip' |
  Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
  Remove-Item -Force

Write-Output "Backup complete: $out.zip"

# ── One-time setup on the server (run in an elevated shell) ───────────────────
# Copy this script to C:\apps\translation-assistant\scripts\backup-db.ps1, then:
#
#   schtasks /Create /TN "TA DB Backup" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST ^
#     /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\translation-assistant\scripts\backup-db.ps1"
#
# Test it immediately with:  schtasks /Run /TN "TA DB Backup"
