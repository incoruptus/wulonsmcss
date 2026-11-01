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
SetupIconFile=..\resources\agent-icon.ico
UninstallDisplayName={#AppName}
UninstallDisplayIcon={app}\agent-icon.ico
ArchitecturesInstallIn64BitMode=x64compatible
SetupLogging=yes
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "autostart"; Description: "开机自动启动助手（推荐）"; GroupDescription: "启动选项"
Name: "desktopicon"; Description: "在桌面放一个快捷方式"; GroupDescription: "快捷方式"

[Files]
Source: "{#SourceExe}"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\resources\agent-icon.ico"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; 旧版只放了一个「Wulon's MCSS 助手」快捷方式，升级时清掉，避免菜单里出现两个入口
Type: files; Name: "{group}\Wulon's MCSS 助手.lnk"

[Icons]
Name: "{group}\打开开服茶"; Filename: "{app}\{#AppExeName}"; Parameters: "--open"; IconFilename: "{app}\agent-icon.ico"
Name: "{group}\启动助手（后台）"; Filename: "{app}\{#AppExeName}"; IconFilename: "{app}\agent-icon.ico"
Name: "{group}\卸载 Wulon's MCSS 助手"; Filename: "{uninstallexe}"
Name: "{autodesktop}\开服茶"; Filename: "{app}\{#AppExeName}"; Parameters: "--open"; IconFilename: "{app}\agent-icon.ico"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "WulonsMCSSAgent"; ValueData: """{app}\{#AppExeName}"" --silent"; Flags: uninsdeletevalue; Tasks: autostart

[Run]
; 不放在 postinstall 里：静默安装也要把助手拉起来，否则装完网页仍然显示「未启动」
Filename: "{app}\{#AppExeName}"; Flags: nowait runhidden; StatusMsg: "启动本机助手…"
Filename: "{app}\{#AppExeName}"; Parameters: "--open"; Description: "打开开服茶网页"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExeName}"; Parameters: "--uninstall-autostart"; Flags: runhidden; RunOnceId: "RemoveAutostart"
Filename: "{cmd}"; Parameters: "/c taskkill /F /IM {#AppExeName} >nul 2>nul"; Flags: runhidden; RunOnceId: "StopAgent"

[Code]
// 助手没有窗口，Inno 的 CloseApplications 找不到它；升级前必须先结束旧进程，否则 exe 被占用。
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  // 只有覆盖同一个安装目录时才需要结束旧进程；新装到别处不打扰正在跑的便携版
  if FileExists(ExpandConstant('{app}\{#AppExeName}')) then
    Exec(ExpandConstant('{cmd}'), '/c taskkill /F /IM {#AppExeName} >nul 2>nul', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Result := '';
end;
