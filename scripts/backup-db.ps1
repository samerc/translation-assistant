# Translation Assistant: nightly backup of the database AND the uploaded files.
#   1. mysqldump of the DB, zipped
#   2. zip of backend\uploads (passport copies, job files, Word templates). The
#      DB only stores their paths, so a DB backup alone can't restore them.
#   3. optional off-site copy of both (BACKUP_OFFSITE_DIR, e.g. a network share,
#      a mounted cloud drive or a OneDrive-synced folder)
#   4. rotation: archives older than the retention window are deleted
# Intended to run nightly via a Windows Scheduled Task (see the bottom).
#
# Settings come from environment variables (machine-level, so the SYSTEM task sees them):
#   DB_BACKUP_PASSWORD   DB password (required; no default in production)
#   BACKUP_OFFSITE_DIR   optional; where to copy each night's archives
#   BACKUP_RETENTION_DAYS optional; default 14 (applies locally and off-site)

$ErrorActionPreference = 'Stop'

$MysqlDump     = 'C:\Program Files\MariaDB 11.4\bin\mysqldump.exe'
$AppDir        = 'C:\apps\translation-assistant'
$UploadsDir    = Join-Path $AppDir 'backend\uploads'
$BackupDir     = Join-Path $AppDir 'db-backups'
$LogFile       = Join-Path $BackupDir 'backup.log'
$RetentionDays = if ($env:BACKUP_RETENTION_DAYS) { [int]$env:BACKUP_RETENTION_DAYS } else { 14 }
$OffsiteDir    = $env:BACKUP_OFFSITE_DIR
$DbHost        = 'localhost'
$DbPort        = '33777'
$DbUser        = 'translation_user'
$DbName        = 'translation_assistant'
$DbPass        = $env:DB_BACKUP_PASSWORD

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
function Log($msg) {
  $line = "$(Get-Date -Format 's') $msg"
  Add-Content -Path $LogFile -Value $line
  Write-Output $line
}

try {
  if (-not $DbPass) { throw 'DB_BACKUP_PASSWORD is not set' }
  if (-not (Test-Path $MysqlDump)) { throw "mysqldump not found at $MysqlDump" }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $sql   = Join-Path $BackupDir "translation_assistant-$stamp.sql"
  $dbZip = "$sql.zip"
  $upZip = Join-Path $BackupDir "uploads-$stamp.zip"

  # --result-file writes the dump directly (avoids PowerShell stdout re-encoding).
  & $MysqlDump -h $DbHost -P $DbPort -u $DbUser "-p$DbPass" `
    --single-transaction --routines --events --default-character-set=utf8mb4 `
    --result-file="$sql" $DbName
  if ($LASTEXITCODE -ne 0) { throw "mysqldump failed with exit code $LASTEXITCODE" }
  Compress-Archive -Path $sql -DestinationPath $dbZip -Force
  Remove-Item $sql -Force
  Log "DB backup: $dbZip ($([math]::Round((Get-Item $dbZip).Length / 1KB)) KB)"

  if (Test-Path $UploadsDir) {
    Compress-Archive -Path (Join-Path $UploadsDir '*') -DestinationPath $upZip -Force
    Log "Uploads backup: $upZip ($([math]::Round((Get-Item $upZip).Length / 1MB, 1)) MB)"
  } else {
    Log "WARNING: uploads folder not found at $UploadsDir, skipped"
  }

  $targets = @($BackupDir)
  if ($OffsiteDir) {
    New-Item -ItemType Directory -Force -Path $OffsiteDir | Out-Null
    Copy-Item $dbZip $OffsiteDir -Force
    if (Test-Path $upZip) { Copy-Item $upZip $OffsiteDir -Force }
    Log "Copied off-site to $OffsiteDir"
    $targets += $OffsiteDir
  } else {
    Log 'WARNING: BACKUP_OFFSITE_DIR not set, backups exist only on this server'
  }

  # Rotate (locally and off-site).
  foreach ($dir in $targets) {
    Get-ChildItem $dir -File |
      Where-Object { $_.Name -match '^(translation_assistant-.*\.sql|uploads-.*)\.zip$' -and
                     $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
      Remove-Item -Force
  }
  Log 'Backup complete'
} catch {
  Log "BACKUP FAILED: $($_.Exception.Message)"
  exit 1
}

# ── One-time setup on the server (elevated PowerShell) ────────────────────────
# 1. Copy this script to C:\apps\translation-assistant\scripts\backup-db.ps1
# 2. Machine-level settings (the task runs as SYSTEM):
#      [Environment]::SetEnvironmentVariable('DB_BACKUP_PASSWORD', '<db password>', 'Machine')
#      [Environment]::SetEnvironmentVariable('BACKUP_OFFSITE_DIR', '\\nas\backups\ta', 'Machine')
# 3. Register the nightly task and run it once:
#      schtasks /Create /TN "TA Backup" /SC DAILY /ST 03:00 /RU SYSTEM /RL HIGHEST /TR "powershell -NoProfile -ExecutionPolicy Bypass -File C:\apps\translation-assistant\scripts\backup-db.ps1"
#      schtasks /Run /TN "TA Backup"
# 4. Check C:\apps\translation-assistant\db-backups\backup.log, then test a restore
#    into a scratch database once:
#      mysql -P 33777 -u root -p -e "CREATE DATABASE ta_restore_test CHARACTER SET utf8mb4"
#      mysql -P 33777 -u root -p ta_restore_test < translation_assistant-<stamp>.sql
