#ifndef AppVersion
  #define AppVersion "28.0.0"
#endif

#ifndef SourceExe
  #define SourceExe "..\agent\target\release\mcss-agent.exe"
#endif

#define AppName "Wulon's MCSS 助手"
#define AppPublisher "Wulon's MCSS"
#define AppExeName "mcss-agent.exe"

[Setup]
AppId={{87B2D6D0-2F52-4A1C-9D0B-2A6E3C5F1A77}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={localappdata}\Programs\Wulons MCSS Agent
DefaultGroupName=Wulon's MCSS
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\release
OutputBaseFilename=mcss-agent-{#AppVersion}-setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayName={#AppName}
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "autostart"; Description: "开机自动启动助手"; GroupDescription: "启动选项"; Flags: unchecked

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\Wulon's MCSS 助手"; Filename: "{app}\{#AppExeName}"
Name: "{group}\卸载 Wulon's MCSS 助手"; Filename: "{uninstallexe}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "WulonsMCSSAgent"; ValueData: """{app}\{#AppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\{#AppExeName}"; Description: "启动 Wulon's MCSS 助手"; Flags: nowait postinstall skipifsilent
