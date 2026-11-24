@echo off
setlocal
where ollama >nul 2>&1
if errorlevel 1 (
  echo Install Ollama: winget install Ollama.Ollama
  pause
  exit /b 1
)
set "OLLAMA_ORIGINS=*"
ollama list >nul 2>&1
if errorlevel 1 start "" /b ollama serve
for /l %%i in (1,1,30) do (
  ollama list >nul 2>&1 && goto ready
  timeout /t 1 /nobreak >nul
)
echo Ollama server did not start.
pause
exit /b 1
:ready
ollama pull exaone3.5:7.8b
if errorlevel 1 exit /b 1
ollama pull qwen3:8b
if errorlevel 1 (
  pause
  exit /b 1
)
echo Ready. Refresh Start-Eobu in your browser.
pause

