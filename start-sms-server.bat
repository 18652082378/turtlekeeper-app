@echo off
cd /d "%~dp0server"
set SMS_MOCK=true
node server.js
