@echo off
chcp 65001 >nul
title 影视仓资源推送链接检测
cd /d "%~dp0"
python "ysc_link_checker.py"
echo.
pause
