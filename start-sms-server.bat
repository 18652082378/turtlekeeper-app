@echo off
cd /d "%~dp0server"
set NODE_ENV=test
set HOST=127.0.0.1
set TURTLE_RUNTIME_DIR=%~dp0tmp\sms-preview
set SMS_MOCK=true
node server.js
