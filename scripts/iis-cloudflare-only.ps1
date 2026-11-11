<#
  Restrict the Translation Assistant IIS site to Cloudflare (+ localhost), so the
  origin can't be reached directly by IP and Cloudflare can't be bypassed.
  Only this site is changed; other IIS sites are untouched.

  Run on the server in an elevated PowerShell:
    powershell -ExecutionPolicy Bypass -File iis-cloudflare-only.ps1 -SiteName "<IIS site name>"
  Re-run any time to refresh Cloudflare's ranges (it replaces the site's list).
  Undo:  Restore-WebConfiguration -Name <backup name printed below>
#>
param(
  [Parameter(Mandatory = $true)][string]$SiteName,
  [string]$HostName = 'translate.fancyshark.com'
)
$ErrorActionPreference = 'Stop'
Import-Module WebAdministration

if (-not (Get-Website -Name $SiteName)) {
  Write-Host "Site '$SiteName' not found. Sites on this server:"; Get-Website | Format-Table name, state -AutoSize; exit 1
}

# 1. The IP Address and Domain Restrictions feature must be installed.
if (Get-Command Get-WindowsFeature -ErrorAction SilentlyContinue) {
  if (-not (Get-WindowsFeature Web-IP-Security).Installed) {
    Write-Host 'Installing IIS "IP and Domain Restrictions"...'
    Install-WindowsFeature Web-IP-Security | Out-Null
  }
}

# 2. Bindings: every binding of this site must carry the host name, otherwise it
#    answers requests for the bare IP.
$bindings = Get-WebBinding -Name $SiteName
$bindings | Format-Table protocol, bindingInformation -AutoSize
$blank = $bindings | Where-Object { $_.protocol -in 'http', 'https' -and $_.bindingInformation -match ':$' }
if ($blank) {
  Write-Warning "These bindings have no host name and answer http(s)://<server IP>:"
  $blank | ForEach-Object { Write-Warning "  $($_.protocol) $($_.bindingInformation)" }
  Write-Warning "Fix in IIS Manager -> Bindings (set host name $HostName), then re-run. Nothing changed."
  exit 1
}

# 3. Backup of the IIS config (rollback with Restore-WebConfiguration).
$backup = 'before-cf-only-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
Backup-WebConfiguration -Name $backup | Out-Null
Write-Host "IIS config backed up as '$backup'"

# 4. Cloudflare's published ranges.
$v4 = (Invoke-WebRequest -UseBasicParsing https://www.cloudflare.com/ips-v4).Content -split "`n" | ForEach-Object Trim | Where-Object { $_ }
$v6 = (Invoke-WebRequest -UseBasicParsing https://www.cloudflare.com/ips-v6).Content -split "`n" | ForEach-Object Trim | Where-Object { $_ }
if ($v4.Count -lt 10 -or $v6.Count -lt 5) { throw "Unexpected Cloudflare IP list ($($v4.Count) v4 / $($v6.Count) v6) - aborting." }

function ConvertTo-Mask([int]$bits) {
  $b = ('1' * $bits).PadRight(32, '0')
  (0..3 | ForEach-Object { [Convert]::ToInt32($b.Substring($_ * 8, 8), 2) }) -join '.'
}

# 5. Unlock the section (locked at server level by default) and write this site's list.
& "$env:windir\system32\inetsrv\appcmd.exe" unlock config -section:system.webServer/security/ipSecurity | Out-Null
$pspath = 'MACHINE/WEBROOT/APPHOST'
$filter = 'system.webServer/security/ipSecurity'
Clear-WebConfiguration -PSPath $pspath -Location $SiteName -Filter $filter -ErrorAction SilentlyContinue

$entries = @(
  @{ ipAddress = '127.0.0.1'; subnetMask = '255.255.255.255'; allowed = 'true' },
  @{ ipAddress = '::1'; subnetMask = '128'; allowed = 'true' }
)
foreach ($cidr in $v4) { $ip, $bits = $cidr -split '/'; $entries += @{ ipAddress = $ip; subnetMask = (ConvertTo-Mask $bits); allowed = 'true' } }
foreach ($cidr in $v6) { $ip, $bits = $cidr -split '/'; $entries += @{ ipAddress = $ip; subnetMask = $bits; allowed = 'true' } }
foreach ($e in $entries) { Add-WebConfigurationProperty -PSPath $pspath -Location $SiteName -Filter $filter -Name '.' -Value $e }

# Allow-list is in place; now deny everyone else (403). Decide by the TCP peer,
# never by X-Forwarded-For (enableProxyMode off), so it can't be spoofed.
Set-WebConfigurationProperty -PSPath $pspath -Location $SiteName -Filter $filter -Name enableProxyMode -Value $false
Set-WebConfigurationProperty -PSPath $pspath -Location $SiteName -Filter $filter -Name allowUnlisted -Value $false

Write-Host "Done: '$SiteName' now accepts only Cloudflare ($($v4.Count) v4 + $($v6.Count) v6 ranges) and localhost."
Write-Host "Check from outside: https://$HostName -> works; http://<server IP> with Host $HostName -> 403."
