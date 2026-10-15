[CmdletBinding(SupportsShouldProcess = $true)]
param([Parameter(Mandatory = $true)][string]$BackupPath)
$ErrorActionPreference = 'Stop'
$backup = (Resolve-Path -LiteralPath $BackupPath).Path
$record = Get-Content -LiteralPath (Join-Path $backup 'rollback.json') -Raw | ConvertFrom-Json
$root = (Resolve-Path -LiteralPath $record.projectPath).Path
$prefix = $root.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
function Get-SafeTarget([string]$relative) {
    $target = [IO.Path]::GetFullPath((Join-Path $root $relative))
    if (-not $target.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Unsafe path: $relative" }
    $check = $target
    while ($check -and $check -ne $root) {
        if (Test-Path -LiteralPath $check) {
            if ((Get-Item -LiteralPath $check -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked path not supported: $relative" }
        }
        $check = Split-Path -Parent $check
    }
    return $target
}
# Validate every file before restoring anything. Never overwrite later edits.
foreach ($item in $record.files) {
    $target = Get-SafeTarget $item.path
    if (-not (Test-Path -LiteralPath $target -PathType Leaf)) { throw "Target missing: $($item.path). Restore manually from the backup." }
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.installedSha256) { throw "File changed after installation: $($item.path). Back up your new work before restoring manually." }
    if ($item.existed) {
        $saved = Join-Path (Join-Path $backup 'original') $item.path
        if (-not (Test-Path -LiteralPath $saved -PathType Leaf)) { throw "Backup file missing: $($item.path)" }
        if ((Get-FileHash -LiteralPath $saved -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.oldSha256) { throw "Backup hash mismatch: $($item.path)" }
    }
}
if (-not $PSCmdlet.ShouldProcess($root, 'Restore original source files and remove files added by this batch')) { return }
foreach ($item in $record.files) {
    $target = Get-SafeTarget $item.path
    if ($item.existed) { Copy-Item -LiteralPath (Join-Path (Join-Path $backup 'original') $item.path) -Destination $target -Force }
    else { Remove-Item -LiteralPath $target -Force }
    "RESTORED $($item.path)" | Add-Content -LiteralPath (Join-Path $backup 'rollback.log')
}
Write-Host 'Source files restored. Browser/IndexedDB resume data was not changed.' -ForegroundColor Green
