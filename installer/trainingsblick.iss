; Inno-Setup-Skript fuer Trainingsblick. Nicht direkt aufrufen, sondern ueber installer\bauen.ps1
; (setzt Version und Quelle: ISCC /DVersion=1.0.0 /DQuelle=installer\build\app).
;
; Installiert ohne Adminrechte nach %LOCALAPPDATA%\Programs\Trainingsblick, mit eigenem Python.
; Einstellungen, Daten und Zugangsdaten liegen nicht hier (lib/orte.py) und bleiben bei Updates erhalten;
; beim Deinstallieren wird gefragt, ob sie mit weg sollen.
; Bis 1.0.1 hiess das Programm "Strava Dashboard": gleiche AppId, damit es als Update gilt; der alte Programmordner
; und die alten Verknuepfungen werden entfernt, die Daten zieht das Programm beim Start selbst um (lib/orte.py).

#ifndef Version
  #error "Version fehlt (/DVersion=...)"
#endif
#ifndef Quelle
  #error "Quelle fehlt (/DQuelle=...)"
#endif

#define Name "Trainingsblick"
#define Start "{app}\python\pythonw.exe"

[Setup]
AppId={{E94AEDA2-5F50-4A0F-A4D6-86341E5BF9C5}
AppName={#Name}
AppVersion={#Version}
AppVerName={#Name} {#Version}
AppPublisher=Tobi
AppPublisherURL=https://github.com/tp-codings/trainingsblick
AppSupportURL=https://github.com/tp-codings/trainingsblick
AppUpdatesURL=https://github.com/tp-codings/trainingsblick/releases
PrivilegesRequired=lowest
DefaultDirName={autopf}\{#Name}
; nicht in den alten Ordner "Strava Dashboard" installieren
UsePreviousAppDir=no
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
WizardStyle=modern
SetupIconFile={#Quelle}\trainingsblick.ico
UninstallDisplayIcon={app}\trainingsblick.ico
UninstallDisplayName={#Name}
OutputBaseFilename=Trainingsblick-Setup-{#Version}
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
; Reste der Versionen als "Strava Dashboard"
Type: files; Name: "{app}\strava_dashboard.py"
Type: files; Name: "{app}\strava_dashboard.ico"
Type: filesandordirs; Name: "{autopf}\Strava Dashboard"
Type: files; Name: "{autoprograms}\Strava Dashboard.lnk"
Type: files; Name: "{autodesktop}\Strava Dashboard.lnk"

[Files]
Source: "{#Quelle}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\{#Name}"; Filename: "{#Start}"; Parameters: """{app}\trainingsblick.py"""; WorkingDir: "{app}"; IconFilename: "{app}\trainingsblick.ico"
Name: "{autodesktop}\{#Name}"; Filename: "{#Start}"; Parameters: """{app}\trainingsblick.py"""; WorkingDir: "{app}"; IconFilename: "{app}\trainingsblick.ico"; Tasks: desktop

[Run]
Filename: "{#Start}"; Parameters: """{app}\trainingsblick.py"""; WorkingDir: "{app}"; Description: "Trainingsblick jetzt starten"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
; vom Programm erzeugte Zwischendateien (__pycache__)
Type: filesandordirs; Name: "{app}"

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent then
    if MsgBox('Sollen auch deine Einstellungen, die geladenen Trainingsdaten und die gespeicherten Zugänge zu Strava und Garmin gelöscht werden?' + #13#10#13#10 +
              'Wähle „Nein“, wenn du Trainingsblick später wieder installieren willst.', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
    begin
      DelTree(ExpandConstant('{userappdata}\Trainingsblick'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\Trainingsblick'), True, True, True);
      // falls der Umzug aus der Zeit als "Strava Dashboard" nie stattfand
      DelTree(ExpandConstant('{userappdata}\StravaDashboard'), True, True, True);
      DelTree(ExpandConstant('{localappdata}\StravaDashboard'), True, True, True);
    end;
end;
