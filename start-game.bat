@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\start-server-hidden.ps1 -Port 5174
start "" "http://127.0.0.1:5174/app/"
