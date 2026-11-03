; 윈도우 설치 프로그램(Inno Setup). GitHub Actions에서 자동으로 만든다.
#define MyAppName "하드 자료 찾기 비서"
#define MyAppVersion "1.0.0"
[Setup]
AppId={{6C1E2F7A-3B5D-4C55-9E21-HDBISEO00001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={autopf}\HDBiseo
DefaultGroupName={#MyAppName}
OutputDir=dist
OutputBaseFilename=HDBiseo-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
[Languages]
Name: "korean"; MessagesFile: "compiler:Languages\Korean.isl"
[Tasks]
Name: "desktopicon"; Description: "바탕화면에 아이콘 만들기"; Flags: checkedonce
Name: "autostart"; Description: "컴퓨터를 켤 때 자동으로 시작(밤 색인용)"; Flags: unchecked
[Files]
Source: "dist\HDBiseo\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion
[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\HDBiseo.exe"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\HDBiseo.exe"; Tasks: desktopicon
Name: "{userstartup}\{#MyAppName}"; Filename: "{app}\HDBiseo.exe"; Parameters: "--no-browser"; Tasks: autostart
[Run]
Filename: "{app}\HDBiseo.exe"; Description: "지금 실행"; Flags: nowait postinstall skipifsilent
