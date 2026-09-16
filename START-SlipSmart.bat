@echo off
REM Double-click to run SlipSmart: starts the server, then opens the site.
cd /d "%~dp0"
start "SlipSmart Server" cmd /k "node server.js"
timeout /t 3 /nobreak >nul
start "" http://localhost:3000
