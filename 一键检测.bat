@echo off
chcp 65001 >nul
title 影视仓资源推送链接检测
cd /d "%~dp0"
python "影视仓链接检测.py"
echo.
pause
