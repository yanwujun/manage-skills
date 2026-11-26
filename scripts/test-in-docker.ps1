<#
.SYNOPSIS
  在 Docker 容器内运行 manage-skills 的测试/构建，隔离宿主机环境。
.DESCRIPTION
  - 项目目录挂载到容器 /app
  - node_modules 使用容器匿名卷，不会覆盖宿主机的 node_modules
  - 自动检查 Docker Desktop 是否运行
  - 若项目路径含中文导致挂载失败，请将项目移到纯英文路径后重试
.EXAMPLE
  .\scripts\test-in-docker.ps1
  .\scripts\test-in-docker.ps1 -Task build
  .\scripts\test-in-docker.ps1 -Task all
#>
param(
    [ValidateSet('test', 'build', 'lint', 'typecheck', 'all')]
    [string]$Task = 'test'
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$nodeImage = 'node:20-alpine'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw '未找到 docker 命令，请先安装 Docker Desktop。'
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Docker Desktop 未运行，请先启动后重试。'
}

if ($Task -eq 'all') {
    $shellCmd = 'npm ci --no-audit --no-fund && npm run build && npm test'
} else {
    $shellCmd = "npm ci --no-audit --no-fund && npm run $Task"
}

Write-Host "容器内执行: $shellCmd" -ForegroundColor Cyan
docker run --rm `
    -v "${projectRoot}:/app" `
    -v /app/node_modules `
    -w /app `
    -e CI=1 `
    $nodeImage `
    sh -lc $shellCmd