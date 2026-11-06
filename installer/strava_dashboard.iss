; Inno-Setup-Skript fuer das Strava Dashboard. Nicht direkt aufrufen, sondern ueber installer\bauen.ps1
; (setzt Version und Quelle: ISCC /DVersion=1.0.0 /DQuelle=installer\build\app).
;
; Installiert ohne Adminrechte nach %LOCALAPPDATA%\Programs\Strava Dashboard, mit eigenem Python.
; Einstellungen, Daten und Zugangsdaten liegen nicht hier (lib/orte.py) und bleiben bei Updates erhalten;
; beim Deinstallieren wird gefragt, ob sie mit weg sollen.

#ifndef Version
  #error "Version fehlt (/DVersion=...)"
#endif
#ifndef Quelle
  #error "Quelle fehlt (/DQuelle=...)"
#endif

#define Name "Strava Dashboard"
#define Start "{app}\python\pythonw.exe"

[Setup]
AppId={{E94AEDA2-5F50-4A0F-A4D6-86341E5BF9C5}
AppName={#Name}
AppVersion={#Version}
AppVerName={#Name} {#Version}
AppPublisher=Tobi
AppPublisherURL=https://github.com/tp-codings/strava_dashboard
AppSupportURL=https://github.com/tp-codings/strava_dashboard
AppUpdatesURL=https://github.com/tp-codings/strava_dashboard/releases
PrivilegesRequired=lowest
DefaultDirName={autopf}\{#Name}
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
WizardStyle=modern
SetupIconFile={#Quelle}\strava_dashboard.ico
UninstallDisplayIcon={app}\strava_dashboard.ico
UninstallDisplayName={#Name}
OutputBaseFilename=Strava-Dashboard-Setup-{#Version}
Compression=lzma2/max
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "de"; MessagesFile: "compiler:Languages\German.isl"

[Tasks]
Name: "desktop"; Description: "Verknüpfung auf dem Desktop anlegen"

[InstallDelete]
; alte Programmteile vor einem Update entfernen (Daten liegen woanders)
Type: filesandordirs; Name: "{app}\python"
Type: filesandordirs; Name: "{app}\lib"
Type: filesandordirs; Name: "{app}\web"

[Files]
Source: "{#Quelle}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#Name}"; Filename: "{#Start}"; Parameters: """{app}\strava_dashboard.py"""; WorkingDir: "{app}"; IconFilename: "{app}\strava_dashboard.ico"
Name: "{autodesktop}\{#Name}"; Filename: "{#Start}"; Parameters: """{app}\strava_dashboard.py"""; WorkingDir: "{app}"; IconFilename: "{app}\strava_dashboard.ico"; Tasks: desktop

[Run]
Filename: "{#Start}"; Parameters: """{app}\strava_dashboard.py"""; WorkingDir: "{app}"; Description: "Strava Dashboard jetzt starten"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; vom Programm erzeugte Zwischendateien (__pycache__)
Type: filesandordirs; Name: "{app}"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    if MsgBox('Sollen auch deine Einstellungen, die geladenen Trainingsdaten und die gespeicherten Zugänge zu Strava und Garmin gelöscht werden?' + #13#10#13#10 +
              'Wähle „Nein“, wenn du das Dashboard später wieder installieren willst.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DelTree(ExpandConstant('{userappdata}\StravaDashboard'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\StravaDashboard'), True, True, True);
    end;
end;
