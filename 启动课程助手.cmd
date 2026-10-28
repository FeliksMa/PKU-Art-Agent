@echo off
cd /d "%~dp0"
node bridge/server.js --open
if errorlevel 1 pause
