@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Trainingsblick

rem Schon eingerichtet? Dann direkt starten.
if exist ".venv\Scripts\pythonw.exe" goto starten

echo.
echo   Trainingsblick wird eingerichtet (nur beim ersten Start, dauert 1-2 Minuten) ...
echo.

rem ---- Python 3.12 oder neuer suchen
set "PY="
for %%V in (3.14 3.13 3.12) do if not defined PY py -%%V -c "import sys" >nul 2>&1 && set "PY=py -%%V"
if not defined PY python -c "import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)" >nul 2>&1 && set "PY=python"
if not defined PY goto python_fehlt

rem ---- Eigene Python-Umgebung im Programmordner anlegen und das Garmin-Paket installieren
echo   Lege die Python-Umgebung an ...
%PY% -m venv .venv
if errorlevel 1 goto venv_fehler
echo   Installiere Zusatzpakete ...
".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt
if errorlevel 1 (
  echo.
  echo   Hinweis: Das Garmin-Paket liess sich nicht installieren. Das Dashboard laeuft trotzdem,
  echo   nur die Koerperdaten von Garmin fehlen. Im Programm gibt es dafuer einen Knopf "Garmin-Paket installieren".
  echo.
  pause
)

rem ---- Verknuepfung auf dem Desktop
powershell -NoProfile -ExecutionPolicy Bypass -Command "$w = New-Object -ComObject WScript.Shell; $s = $w.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Trainingsblick.lnk'); $s.TargetPath = '%~dp0.venv\Scripts\pythonw.exe'; $s.Arguments = '\"%~dp0trainingsblick.py\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Trainingsblick'; $s.Save()" >nul 2>&1
echo   Fertig. Auf dem Desktop liegt jetzt eine Verknuepfung "Trainingsblick".
echo.

:starten
start "" ".venv\Scripts\pythonw.exe" "%~dp0trainingsblick.py" %*
exit /b 0

:python_fehlt
echo   Python 3.12 oder neuer wurde nicht gefunden.
echo.
where winget >nul 2>&1 || goto python_hand
choice /c JN /m "  Soll Python jetzt automatisch installiert werden"
if errorlevel 2 goto python_hand
winget install -e --id Python.Python.3.13 --scope user --accept-package-agreements --accept-source-agreements
echo.
echo   Python ist installiert. Bitte dieses Fenster schliessen und "Trainingsblick starten" noch einmal doppelklicken.
echo.
pause
exit /b 1

:python_hand
echo   Bitte Python von https://www.python.org/downloads/ installieren (Version 3.12 oder neuer,
echo   im Installer den Haken bei "Add python.exe to PATH" setzen) und danach diese Datei noch einmal starten.
echo.
start "" "https://www.python.org/downloads/"
pause
exit /b 1

:venv_fehler
echo.
echo   Die Python-Umgebung konnte nicht angelegt werden. Liegt der Ordner vielleicht in einem
echo   schreibgeschuetzten Ort (z. B. direkt in C:\Programme)? Dann den Ordner nach "Dokumente" verschieben.
echo.
if exist ".venv" rmdir /s /q ".venv"
pause
exit /b 1
