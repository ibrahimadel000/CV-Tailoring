[CmdletBinding(SupportsShouldProcess = $true)]
param([Parameter(Mandatory = $true)][string]$ProjectPath)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath $ProjectPath).Path
$bundle = $PSScriptRoot
$manifest = Get-Content -LiteralPath (Join-Path $bundle 'manifest.json') -Raw | ConvertFrom-Json
$package = Join-Path $root 'package.json'
if (-not (Test-Path -LiteralPath $package -PathType Leaf)) { throw 'Choose the project folder containing package.json.' }
if ((Get-FileHash -LiteralPath $package -Algorithm SHA256).Hash.ToLowerInvariant() -ne $manifest.packageSha256) {
    throw 'package.json differs from the uploaded project. Stop and share the updated project before applying this batch.'
}
function Get-SafeTarget([string]$relative) {
    $target = [IO.Path]::GetFullPath((Join-Path $root $relative))
    $prefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe target: $relative" }
    $check = $target
    while ($check -and $check -ne $root) {
        if (Test-Path -LiteralPath $check) {
            $item = Get-Item -LiteralPath $check -Force
            if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked path not supported: $relative" }
        }
        $check = Split-Path -Parent $check
    }
    return $target
}
$changes = @()
foreach ($item in $manifest.files) {
    $source = Join-Path (Join-Path $bundle 'payload') $item.path
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Missing payload: $($item.path)" }
    if ((Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.newSha256) { throw "Payload hash mismatch: $($item.path)" }
    $target = Get-SafeTarget $item.path
    $exists = Test-Path -LiteralPath $target
    if ($exists) {
        if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Target is not a file: $($item.path)" }
        $actual = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($actual -eq $item.newSha256) { continue }
        if (-not $item.oldSha256 -or $actual -ne $item.oldSha256) { throw "Local changes detected in $($item.path). No files were applied. Share the updated file instead of overwriting it." }
    } elseif ($item.oldSha256) {
        throw "Original file is missing: $($item.path). No files were applied."
    }
    $changes += [pscustomobject]@{ path = $item.path; existed = $exists; oldSha256 = $item.oldSha256; installedSha256 = $item.newSha256 }
}
if ($changes.Count -eq 0) { Write-Host 'This batch is already applied. No changes needed.' -ForegroundColor Green; return }
if (-not $PSCmdlet.ShouldProcess($root, "Apply $($changes.Count) files with backups")) { return }
$backup = Join-Path (Join-Path $root '.cv-builder-backups') ((Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
# Finish all backups before replacing the first source file.
foreach ($item in $changes) {
    if ($item.existed) {
        $saved = Join-Path (Join-Path $backup 'original') $item.path
        New-Item -ItemType Directory -Path (Split-Path -Parent $saved) -Force | Out-Null
        Copy-Item -LiteralPath (Get-SafeTarget $item.path) -Destination $saved
    }
}
@{ projectPath = $root; created = (Get-Date).ToString('o'); files = @($changes) } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $backup 'rollback.json') -Encoding UTF8
Copy-Item -LiteralPath (Join-Path $bundle 'Rollback-UI.ps1') -Destination (Join-Path $backup 'Rollback-UI.ps1')
$applied = @()
try {
    foreach ($item in $changes) {
        $target = Get-SafeTarget $item.path
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        # Track before copying so a partially written file is also restored on failure.
        $applied += $item
        Copy-Item -LiteralPath (Join-Path (Join-Path $bundle 'payload') $item.path) -Destination $target -Force
        if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.installedSha256) { throw "Copy verification failed: $($item.path)" }
        "APPLIED $($item.path)" | Add-Content -LiteralPath (Join-Path $backup 'install.log')
    }
} catch {
    foreach ($item in $applied) {
        $target = Get-SafeTarget $item.path
        if ($item.existed) { Copy-Item -LiteralPath (Join-Path (Join-Path $backup 'original') $item.path) -Destination $target -Force }
        elseif (Test-Path -LiteralPath $target -PathType Leaf) { Remove-Item -LiteralPath $target -Force }
    }
    throw "Installation failed and touched files were restored. Backup: $backup. Error: $($_.Exception.Message)"
}
Write-Host "`nApplied $($changes.Count) files successfully." -ForegroundColor Green
Write-Host "Backup and rollback script: $backup"
Write-Host 'Next: open the project terminal, run npm run build, then npm run dev.'
Write-Host 'Keep the same browser and development URL to access existing locally saved resumes.'
