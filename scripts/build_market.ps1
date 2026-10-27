$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
Push-Location $projectDir
try {
    & npm.cmd --prefix frontend ci --no-fund --no-audit
    if ($LASTEXITCODE -ne 0) { throw 'Frontend install failed' }
    & npm.cmd --prefix frontend run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed' }
    $env:PYTHONUTF8 = '1'
    & .venv/Scripts/python.exe -m PyInstaller --noconfirm --clean --name MarketWorkbench --onedir --console --add-data 'frontend/dist;frontend/dist' --collect-submodules uvicorn --collect-all curl_cffi run_market.py
    if ($LASTEXITCODE -ne 0) { throw 'Packaging failed' }
    Copy-Item -LiteralPath extension -Destination dist/MarketWorkbench -Recurse -Force
    Copy-Item -LiteralPath docs/本地工具使用说明.md -Destination dist/MarketWorkbench -Force
    Copy-Item -LiteralPath docs/使用说明.html -Destination dist/MarketWorkbench -Force
    Copy-Item -LiteralPath docs/images -Destination dist/MarketWorkbench -Recurse -Force
    Copy-Item -LiteralPath LICENSE -Destination dist/MarketWorkbench -Force
    Copy-Item -LiteralPath THIRD_PARTY_NOTICES.md -Destination dist/MarketWorkbench -Force
    & .venv/Scripts/python.exe scripts/collect_market_licenses.py dist/MarketWorkbench
    if ($LASTEXITCODE -ne 0) { throw 'License collection failed' }
} finally { Pop-Location }
