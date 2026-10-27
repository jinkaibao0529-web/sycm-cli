@echo off
setlocal
cd /d "%~dp0.."
set PYTHONUTF8=1
if not exist ".venv\Scripts\python.exe" (
  py -3 -m venv .venv
  if errorlevel 1 goto :failed
  ".venv\Scripts\python.exe" -m pip install -r requirements-web.txt
  if errorlevel 1 goto :failed
)
if not exist "frontend\dist\index.html" (
  echo Frontend is not built. Run npm --prefix frontend ci and npm --prefix frontend run build first.
  goto :failed
)
".venv\Scripts\python.exe" run_market.py
if errorlevel 1 goto :failed
exit /b 0
:failed
echo Startup failed. Please read the error above.
pause
exit /b 1
