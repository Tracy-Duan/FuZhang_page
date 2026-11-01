@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动服章，请打开 http://127.0.0.1:8080/
call npm run dev
