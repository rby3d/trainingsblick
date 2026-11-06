# Baut den Windows-Installer (installer\build\Strava-Dashboard-Setup-<Version>.exe).
#
#   1. Python "embeddable" von python.org (fest: $PyVersion, Pruefsumme $PySha256) nach build\app\python
#   2. Pakete aus installer\abhaengigkeiten.txt als fertige Wheels nach build\app\python\Lib\site-packages
#   3. Programmdateien (strava_dashboard.py, lib, web\index.html) und das Symbol dazu
#   4. Kurztest: Demo-Server mit dem eingebetteten Python starten und /api/start abfragen
#   5. Inno Setup (installer\strava_dashboard.iss) packt alles in eine Setup.exe
#
# Aufruf:  powershell -ExecutionPolicy Bypass -File installer\bauen.ps1 [-Version 1.2.0] [-OhneSetup]
# Braucht: Python 3.12 (py -3.12 oder $env:PYTHON) zum Herunterladen der Pakete, Inno Setup 6 (ISCC.exe).
# Die Oberflaeche wird NICHT gebaut: web\index.html ist eingecheckt (vorher ggf. "cd ui; npm run build").
param([string]$Version = "", [switch]$OhneSetup)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$PyVersion = "3.12.10"
# SHA256 der Zip; abgeglichen mit der MD5 auf python.org/downloads/release/python-31210 (fe8ef205f2e9c3ba44d0cf9954e1abd3)
$PySha256 = "4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3"
$Wurzel = Split-Path $PSScriptRoot -Parent
$Build = Join-Path $PSScriptRoot "build"
$App = Join-Path $Build "app"
$Cache = Join-Path $PSScriptRoot "cache"

# ---- Version: lib\version.py ist die Quelle, ein uebergebener Wert (Git-Tag) muss passen
$imCode = (Select-String -Path (Join-Path $Wurzel "lib\version.py") -Pattern '^VERSION\s*=\s*"([^"]+)"').Matches[0].Groups[1].Value
if ($Version -and $Version.TrimStart("v") -ne $imCode) { throw "Version $Version passt nicht zu lib\version.py ($imCode)" }
$Version = $imCode
Write-Host "Strava Dashboard $Version"

# ---- Python fuer pip
# @( ... ) aussen: ein if mit nur einem Wert lieferte sonst einen Text statt einer Liste ($PyBefehl[0] waere dann "p")
$PyBefehl = @(if ($env:PYTHON) { $env:PYTHON } else { "py", "-3.12" })
function Python-Aufruf { & $PyBefehl[0] @($PyBefehl | Select-Object -Skip 1) @args; if ($LASTEXITCODE) { throw "Python-Aufruf fehlgeschlagen: $args" } }

# ---- 1. eingebettetes Python
if (Test-Path $Build) { Remove-Item $Build -Recurse -Force }
New-Item -ItemType Directory -Force $App, $Cache | Out-Null
$Zip = Join-Path $Cache "python-$PyVersion-embed-amd64.zip"
if (-not (Test-Path $Zip)) {
    Write-Host "Lade Python $PyVersion (embeddable) ..."
    Invoke-WebRequest "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" -OutFile $Zip -UseBasicParsing
}
$Ist = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLower()
if ($Ist -ne $PySha256) { Remove-Item $Zip; throw "Pruefsumme von $Zip stimmt nicht ($Ist)" }
$PyOrdner = Join-Path $App "python"
Expand-Archive $Zip $PyOrdner
$Pth = Get-ChildItem $PyOrdner -Filter "python3*._pth" | Select-Object -First 1
$Zipname = (Get-ChildItem $PyOrdner -Filter "python3*.zip" | Select-Object -First 1).Name
# site-packages einbinden; "import site" wertet .pth-Dateien der Pakete aus
Set-Content $Pth.FullName -Encoding ascii -Value @($Zipname, ".", "Lib\site-packages", "import site")

# ---- 2. Pakete (nur fertige Wheels fuer Windows 64 Bit, CPython 3.12)
Write-Host "Installiere Pakete ..."
$Sp = Join-Path $PyOrdner "Lib\site-packages"
Python-Aufruf -m pip install --disable-pip-version-check --no-compile --quiet --target $Sp --only-binary=:all: `
    --platform win_amd64 --python-version 3.12 --implementation cp -r (Join-Path $PSScriptRoot "abhaengigkeiten.txt")
Get-ChildItem $Sp -Directory -Filter "bin" | Remove-Item -Recurse -Force

# ---- 3. Programmdateien
Copy-Item (Join-Path $Wurzel "strava_dashboard.py"), (Join-Path $Wurzel "README.md") $App
New-Item -ItemType Directory -Force (Join-Path $App "lib"), (Join-Path $App "web") | Out-Null
Copy-Item (Join-Path $Wurzel "lib\*.py") (Join-Path $App "lib")
Copy-Item (Join-Path $Wurzel "web\index.html") (Join-Path $App "web")
Python-Aufruf (Join-Path $PSScriptRoot "symbol.py") (Join-Path $App "strava_dashboard.ico")

# ---- 4. Kurztest mit dem eingebetteten Python (Demo, ohne Fenster, eigener Datenordner)
Write-Host "Kurztest ..."
$env:STRAVA_DASHBOARD_DATEN = Join-Path $Build "testdaten"
$Port = Get-Random -Minimum 20000 -Maximum 40000
$P = Start-Process (Join-Path $PyOrdner "python.exe") -ArgumentList "`"$App\strava_dashboard.py`"", "--kein-fenster", "--demo", "--port", $Port, "--token", "probe" `
    -PassThru -WindowStyle Hidden -RedirectStandardError (Join-Path $Build "test_fehler.txt") -RedirectStandardOutput (Join-Path $Build "test_ausgabe.txt")
try {
    $ok = $false
    foreach ($i in 1..30) {
        Start-Sleep -Milliseconds 500
        try {
            $r = Invoke-WebRequest "http://127.0.0.1:$Port/api/start?t=probe" -Method Post -Body "{}" -UseBasicParsing -TimeoutSec 5
            if ($r.StatusCode -eq 200 -and $r.Content -match '"demo": ?true') { $ok = $true; break }
        } catch { }
    }
    if (-not $ok) { throw "Kurztest fehlgeschlagen: $(Get-Content (Join-Path $Build 'test_fehler.txt') -Raw)" }
    $g = & (Join-Path $PyOrdner "python.exe") -X utf8 (Join-Path $App "lib\garmin_helfer.py") pruefen
    if ($g -notmatch '"ok": true') { throw "Garmin-Helfer findet garminconnect nicht: $g" }
    Write-Host "Kurztest ok ($g)"
} finally {
    Stop-Process -Id $P.Id -Force -ErrorAction SilentlyContinue
    Remove-Item Env:STRAVA_DASHBOARD_DATEN
}
Get-ChildItem $App -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force

if ($OhneSetup) { Write-Host "Fertig (ohne Setup): $App"; exit 0 }

# ---- 5. Setup.exe
$Iscc = @((Get-Command ISCC.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source -First 1),
          "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe",
          "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
          "$env:ProgramFiles\Inno Setup 6\ISCC.exe") | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $Iscc) { throw "Inno Setup 6 nicht gefunden (https://jrsoftware.org/isdl.php)" }
& $Iscc "/DVersion=$Version" "/DQuelle=$App" "/O$Build" (Join-Path $PSScriptRoot "strava_dashboard.iss")
if ($LASTEXITCODE) { throw "Inno Setup fehlgeschlagen" }
Write-Host "Fertig: $(Join-Path $Build "Strava-Dashboard-Setup-$Version.exe")"
