<#
.SYNOPSIS
  执行前的危险脚本扫描器：静态检查 PowerShell 脚本或命令中的破坏性操作，命中则拒绝执行。
.DESCRIPTION
  扫描内容包括：递归删除、磁盘格式化/分区、关机重启、修改执行策略、
  注册表删除、git 强制清理、docker 系统清理、危险变量参与操作、动态执行等。
  未命中才执行；命中需人工审阅后加 -Force 才能继续。
.EXAMPLE
  .\scripts\guard.ps1 .\some-script.ps1
  .\scripts\guard.ps1 -Command "Remove-Item C:\temp\a -Recurse"
  .\scripts\guard.ps1 .\some-script.ps1 -Force
#>
param(
    [Parameter(Mandatory = $true, ParameterSetName = 'File')]
    [string]$Path,

    [Parameter(Mandatory = $true, ParameterSetName = 'Command')]
    [string]$Command,

    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$patterns = @(
    @{ Name = '递归删除';        Pattern = 'Remove-Item[^\r\n]*-(Recurse|r)\b' },
    @{ Name = '递归删除(rd)';    Pattern = '\b(rd|rmdir)\s+/s' },
    @{ Name = '强制删除(del)';   Pattern = '\bdel\s+/[fq]' },
    @{ Name = '格式化磁盘';      Pattern = '\bFormat-Volume\b|\bformat\s+[a-z]:' },
    @{ Name = '磁盘分区操作';    Pattern = '\bdiskpart\b|\bClear-Disk\b|\bInitialize-Disk\b' },
    @{ Name = '关机/重启';       Pattern = '\bshutdown\b|\bRestart-Computer\b|\bStop-Computer\b' },
    @{ Name = '修改执行策略';    Pattern = '\bSet-ExecutionPolicy\b' },
    @{ Name = '注册表删除';      Pattern = 'Remove-Item[^\r\n]*HKLM|Remove-ItemProperty[^\r\n]*HKLM|\breg\s+delete' },
    @{ Name = 'git 强制清理';    Pattern = '\bgit\s+clean\s+-[a-z]*f' },
    @{ Name = 'docker 系统清理'; Pattern = '\bdocker\s+(system|volume|image|container)\s+prune' },
    @{ Name = '危险变量使用';    Pattern = '\$home\b|\$profile\b|\$env:USERPROFILE' },
    @{ Name = '动态执行';        Pattern = '\b(iex|Invoke-Expression)\b' },
    @{ Name = '计划任务';        Pattern = '\b(schtasks|Register-ScheduledTask)\b' },
    @{ Name = '服务删除';        Pattern = '\bsc\s+delete\b' }
)

if ($PSCmdlet.ParameterSetName -eq 'File') {
    if (-not (Test-Path $Path)) { throw "文件不存在: $Path" }
    $text = Get-Content -Raw -Encoding UTF8 $Path
    $label = $Path
} else {
    $text = $Command
    $label = '内联命令'
}

$hits = @()
$lines = $text -split "`r?`n"
for ($i = 0; $i -lt $lines.Count; $i++) {
    foreach ($p in $patterns) {
        if ($lines[$i] -match $p.Pattern) {
            $hits += [pscustomobject]@{ 行号 = $i + 1; 类型 = $p.Name; 内容 = $lines[$i].Trim() }
        }
    }
}

if ($hits.Count -eq 0) {
    Write-Host "未发现危险模式: $label" -ForegroundColor Green
} else {
    Write-Host "发现 $($hits.Count) 处危险模式: $label" -ForegroundColor Red
    $hits | Format-Table -AutoSize | Out-String -Width 240 | Write-Host
}

if ($hits.Count -gt 0 -and -not $Force) {
    Write-Host '已拒绝执行。确认已审阅并接受风险后，加 -Force 重试。' -ForegroundColor Red
    exit 1
}

if ($PSCmdlet.ParameterSetName -eq 'File') {
    Write-Host "即将执行: $Path" -ForegroundColor Cyan
    & $Path
} else {
    Write-Host "即将执行内联命令" -ForegroundColor Cyan
    Invoke-Expression $Command
}