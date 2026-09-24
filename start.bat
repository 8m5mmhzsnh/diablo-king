@echo off
rem Startet den D4 Spickzettel lokal (noetig fuer die Texterkennung) und oeffnet den Browser.
cd /d "%~dp0"
set PORT=%1
if "%PORT%"=="" set PORT=8000
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\server.ps1" -Port %PORT%
