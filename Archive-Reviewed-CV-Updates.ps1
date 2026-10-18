[CmdletBinding(SupportsShouldProcess = $true)]
param([string]$ProjectPath = 'E:\cv tailor - Copy')
$ErrorActionPreference = 'Stop'
# Moves only the 25 reviewed update artifacts. No permanent deletion.
$plan = @'
[
  {
    "Name": "_cv-design-batch12-af5e226f868346daa8db31b794b16bf4",
    "Kind": "Directory",
    "FileCount": 10,
    "Bytes": 406480
  },
  {
    "Name": "_cv-foundation-batch10-f7a77718a8e04ed2ba701cdc70b56fca",
    "Kind": "Directory",
    "FileCount": 17,
    "Bytes": 771508
  },
  {
    "Name": "_cv-input-ux-batch08-d2def0fa9e804854938119e159c98ae1",
    "Kind": "Directory",
    "FileCount": 12,
    "Bytes": 476013
  },
  {
    "Name": "_cv-live-drag-batch09-bb254d1e1cc4441ba9a7414106573814",
    "Kind": "Directory",
    "FileCount": 13,
    "Bytes": 654620
  },
  {
    "Name": "_cv-page-control-batch07-68b541993ccf49b886a3ec972650fc4b",
    "Kind": "Directory",
    "FileCount": 18,
    "Bytes": 506705
  },
  {
    "Name": "_cv-page-control-batch07-927c76bc3e8f4737912fb92b01ef3f8f",
    "Kind": "Directory",
    "FileCount": 18,
    "Bytes": 506705
  },
  {
    "Name": "_cv-pagination-batch06-26e36c69548b44b79d68ff486b67b5fa",
    "Kind": "Directory",
    "FileCount": 13,
    "Bytes": 349981
  },
  {
    "Name": "_cv-photo-batch11-8cd8baba1d154456b57c70db38754a0e",
    "Kind": "Directory",
    "FileCount": 16,
    "Bytes": 625595
  },
  {
    "Name": "_cv-ui-batch02-20261015-061918-b53489",
    "Kind": "Directory",
    "FileCount": 17,
    "Bytes": 603004
  },
  {
    "Name": "_cv-ui-batch03-3ff2248a4d5c46a0aa8505fcf0029d10",
    "Kind": "Directory",
    "FileCount": 12,
    "Bytes": 432949
  },
  {
    "Name": "_cv-ui-batch04-3675616cc8a84545af7ff01ef6091e26",
    "Kind": "Directory",
    "FileCount": 14,
    "Bytes": 820709
  },
  {
    "Name": "_cv-ui-update-20261015-051300",
    "Kind": "Directory",
    "FileCount": 21,
    "Bytes": 382556
  },
  {
    "Name": "_cv-ux-batch05-9e9dd49650634f90a5f70af897f26734",
    "Kind": "Directory",
    "FileCount": 16,
    "Bytes": 674146
  },
  {
    "Name": "CV-Builder-Design-Scroll-Batch-12.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 305018
  },
  {
    "Name": "CV-Builder-Foundation-Batch-10.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 681361
  },
  {
    "Name": "CV-Builder-Input-UX-Batch-08.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 374837
  },
  {
    "Name": "CV-Builder-Live-Drag-Batch-09.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 542237
  },
  {
    "Name": "CV-Builder-Page-Control-Batch-07.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 385626
  },
  {
    "Name": "CV-Builder-Pagination-Batch-06.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 256291
  },
  {
    "Name": "CV-Builder-Personal-Photo-Batch-11.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 507837
  },
  {
    "Name": "CV-Builder-UI-Batch-01.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 289290
  },
  {
    "Name": "CV-Builder-UI-Batch-02.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 499137
  },
  {
    "Name": "CV-Builder-UI-Batch-03.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 351055
  },
  {
    "Name": "CV-Builder-UI-Batch-04.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 708405
  },
  {
    "Name": "CV-Builder-UX-Batch-05.zip",
    "Kind": "File",
    "FileCount": 1,
    "Bytes": 556325
  }
]
'@ | ConvertFrom-Json

$root = (Resolve-Path -LiteralPath $ProjectPath).Path.TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $root 'package.json') -PathType Leaf)) { throw 'package.json not found.' }
$check = $root
while ($check) {
    $node = Get-Item -LiteralPath $check -Force
    if ($node.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked project path not supported: $check" }
    $parent = Split-Path -Parent $check
    if ($parent -eq $check) { break }
    $check = $parent
}
function Get-ArtifactFiles([string]$Path) {
    $q = New-Object 'System.Collections.Generic.Queue[string]'
    $q.Enqueue($Path)
    while ($q.Count -gt 0) {
        $item = Get-Item -LiteralPath $q.Dequeue() -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Linked artifact not supported: $($item.FullName)" }
        if ($item.PSIsContainer) {
            foreach ($child in Get-ChildItem -LiteralPath $item.FullName -Force) { $q.Enqueue($child.FullName) }
        } else { $item }
    }
}
$selected = @()
foreach ($entry in $plan) {
    if ($entry.Name -ne [IO.Path]::GetFileName($entry.Name)) { throw 'Invalid artifact name.' }
    $source = Join-Path $root $entry.Name
    if (-not (Test-Path -LiteralPath $source)) { Write-Host "Already absent - skipped: $($entry.Name)"; continue }
    $item = Get-Item -LiteralPath $source -Force
    if (($entry.Kind -eq 'Directory') -ne [bool]$item.PSIsContainer) { throw "Unexpected item type: $($entry.Name)" }
    $files = @(Get-ArtifactFiles $source)
    $bytes = ($files | Measure-Object Length -Sum).Sum
    if ($files.Count -ne $entry.FileCount -or $bytes -ne $entry.Bytes) { throw "Artifact changed since inventory. Nothing moved. Send a new inventory: $($entry.Name)" }
    if ($item.PSIsContainer) {
        foreach ($required in @('Apply-UI.ps1','manifest.json','payload')) {
            if (-not (Test-Path -LiteralPath (Join-Path $source $required))) { throw "Not the expected update folder: $($entry.Name)" }
        }
    }
    $selected += $entry
}
if ($selected.Count -eq 0) { Write-Host 'No reviewed update artifacts remain in this project.' -ForegroundColor Green; return }
$selected | Select-Object Name,Kind | Format-Table -AutoSize | Out-Host
if (-not $PSCmdlet.ShouldProcess($root, "Archive $($selected.Count) reviewed update artifacts outside the project, with restore option")) { return }
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
Push-Location -LiteralPath $root
try {
    Write-Host 'Checking existing build before moving anything...' -ForegroundColor Cyan
    & $npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Existing build failed. Nothing moved. Send the build error.' }
} finally { Pop-Location }
$archive = Join-Path (Split-Path -Parent $root) ((Split-Path -Leaf $root) + '-cleanup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory -Path $archive | Out-Null
@{ ProjectPath=$root; Created=(Get-Date).ToString('o'); Items=@($selected | ForEach-Object { $_.Name }) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $archive 'cleanup-manifest.json') -Encoding UTF8
$restore = @'
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'cleanup-manifest.json') -Raw | ConvertFrom-Json
$project = $manifest.ProjectPath
if (-not (Test-Path -LiteralPath (Join-Path $project 'package.json') -PathType Leaf)) { throw 'Original project path is unavailable.' }
$pending = @()
foreach ($name in $manifest.Items) {
    if ($name -ne [IO.Path]::GetFileName($name)) { throw 'Invalid restore name.' }
    $source = Join-Path $PSScriptRoot $name
    $target = Join-Path $project $name
    if (-not (Test-Path -LiteralPath $source)) { continue }
    if (Test-Path -LiteralPath $target) { throw "Restore stopped to avoid overwriting: $target" }
    $pending += [pscustomobject]@{Source=$source;Target=$target}
}
foreach ($entry in $pending) { Move-Item -LiteralPath $entry.Source -Destination $entry.Target -ErrorAction Stop }
Write-Host 'Archived items restored. No existing project files were overwritten.' -ForegroundColor Green
'@
Set-Content -LiteralPath (Join-Path $archive 'Restore-Cleanup.ps1') -Value $restore -Encoding UTF8
try {
    foreach ($entry in $selected) {
        Move-Item -LiteralPath (Join-Path $root $entry.Name) -Destination (Join-Path $archive $entry.Name) -ErrorAction Stop
        $entry.Name | Add-Content -LiteralPath (Join-Path $archive 'moved-items.txt') -Encoding UTF8
    }
    Push-Location -LiteralPath $root
    try {
        Write-Host 'Checking build after cleanup...' -ForegroundColor Cyan
        & $npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed after cleanup.' }
    } finally { Pop-Location }
} catch {
    $failure = $_.Exception.Message
    Write-Warning "Cleanup check failed: $failure. Attempting restore."
    try { & (Join-Path $archive 'Restore-Cleanup.ps1') }
    catch { throw "Automatic restore could not finish. No archive was deleted. Archive: $archive. Restore error: $($_.Exception.Message)" }
    throw "Cleanup was not accepted; archived items restored. Original error: $failure. Archive log: $archive"
}
Write-Host ''
Write-Host 'Cleanup completed: reviewed update artifacts moved, not deleted.' -ForegroundColor Green
Write-Host "Archive and restore script: $archive" -ForegroundColor Cyan
Write-Host 'Source, environment files, Git, dependencies, dist and .cv-builder-backups were not selected for moving.'
Write-Host 'The build refreshed dist as usual. This operation does not free disk space.'
Write-Host 'Run npm run dev using your usual browser, address and port. Test your resumes, photo, Design scrolling and PDF export.'
Write-Host 'Keep the external archive until runtime testing passes. Do not delete .cv-builder-backups.'
