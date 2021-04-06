; Script generated with the Venis Install Wizard

; Define your application name
!define APPNAME "Scrapyard Helper"
!define VERSION "0.2.0"

!define APPNAMEANDVERSION "${APPNAME} ${VERSION}"

; Main Install settings
Name "${APPNAMEANDVERSION}"
InstallDir "$PROGRAMFILES\${APPNAME}"
InstallDirRegKey HKLM "Software\${APPNAME}" ""
OutFile "scrapyard-helper-${VERSION}.exe"

; Use compression
SetCompressor LZMA

; Modern interface settings
!include "MUI.nsh"

!define MUI_ICON ".\assets\scrapyard.ico"
!define MUI_UNICON ".\assets\scrapyard.ico"

!define MUI_HEADERIMAGE

!define MUI_HEADERIMAGE_BITMAP "${NSISDIR}\Contrib\Graphics\Header\win.bmp"
!define MUI_HEADERIMAGE_UNBITMAP "${NSISDIR}\Contrib\Graphics\Header\win.bmp"

!define MUI_WELCOMEFINISHPAGE_BITMAP ".\assets\scrapyard.bmp"
!define MUI_UNWELCOMEFINISHPAGE_BITMAP ".\assets\scrapyard.bmp"

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

; Set languages (first is default language)
!insertmacro MUI_LANGUAGE "English"

function StrReplace
  Exch $0 ;this will replace wrong characters
  Exch
  Exch $1 ;needs to be replaced
  Exch
  Exch 2
  Exch $2 ;the original string
  Push $3 ;counter
  Push $4 ;temp character
  Push $5 ;temp string
  Push $6 ;length of string that need to be replaced
  Push $7 ;length of string that will replace
  Push $R0 ;tempstring
  Push $R1 ;tempstring
  Push $R2 ;tempstring
  StrCpy $3 "-1"
  StrCpy $5 ""
  StrLen $6 $1
  StrLen $7 $0
  Loop:
  IntOp $3 $3 + 1
  Loop_noinc:
  StrCpy $4 $2 $6 $3
  StrCmp $4 "" ExitLoop
  StrCmp $4 $1 Replace
  Goto Loop
  Replace:
  StrCpy $R0 $2 $3
  IntOp $R2 $3 + $6
  StrCpy $R1 $2 "" $R2
  StrCpy $2 $R0$0$R1
  IntOp $3 $3 + $7
  Goto Loop_noinc
  ExitLoop:
  StrCpy $0 $2
  Pop $R2
  Pop $R1
  Pop $R0
  Pop $7
  Pop $6
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Exch $0
FunctionEnd

Section "Scrapyard Helper" Section1

	; Set Section properties
	SetOverwrite on

	; Set Section Files and Shortcuts
	SetOutPath "$INSTDIR\"
	File "assets\scrapyard.ico"
	File /r "dist/scrapyard_helper\"

	Push '$INSTDIR\scrapyard_helper.exe'
    Push "\"
    Push "/"
    Call StrReplace
    Pop $1

	FileOpen $0 manifest.json w
	FileWrite $0 '{$\n'
    FileWrite $0 '"name": "scrapyard_helper",$\n'
    FileWrite $0 '"description": "Scrapyard helper application",$\n'
    FileWrite $0 '"path": "$1",$\n'
    FileWrite $0 '"type": "stdio",$\n'
    FileWrite $0 '"allowed_extensions": [ "scrapyard@firefox", "scrapyard-we@firefox" ]$\n'
    FileWrite $0 '}$\n'
    FileClose $0

SectionEnd

Section -FinishSection

    WriteRegStr HKCU "Software\Mozilla\NativeMessagingHosts\scrapyard_helper" "" "$INSTDIR\manifest.json"

	WriteRegStr HKLM "Software\${APPNAME}" "" "$INSTDIR"
	WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayName" "${APPNAME}"
	WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "UninstallString" "$INSTDIR\uninstall.exe"
	WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}" "DisplayIcon" "$INSTDIR\scrapyard.ico"
	WriteUninstaller "$INSTDIR\uninstall.exe"

    CreateDirectory "$SMPROGRAMS\${APPNAME}"
	CreateShortCut "$SMPROGRAMS\${APPNAME}\Uninstall.lnk" "$INSTDIR\uninstall.exe"
SectionEnd

; Modern install component descriptions
#!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
#	!insertmacro MUI_DESCRIPTION_TEXT ${Section1} ""
#!insertmacro MUI_FUNCTION_DESCRIPTION_END

;Uninstall section
Section Uninstall

	;Remove from registry...
	DeleteRegKey HKCU "Software\Mozilla\NativeMessagingHosts\scrapyard_helper"
	DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPNAME}"
	DeleteRegKey HKLM "SOFTWARE\${APPNAME}"

	; Delete self
	Delete "$INSTDIR\uninstall.exe"

	; Delete Shortcuts
	Delete "$SMPROGRAMS\${APPNAME}\Uninstall.lnk"

	; Remove remaining directories
	RMDir /r "$SMPROGRAMS\${APPNAME}"
	RMDir /r "$INSTDIR\"

SectionEnd

; On initialization
Function .onInit

	#!insertmacro MUI_LANGDLL_DISPLAY

FunctionEnd

BrandingText "Scrapyard Helper"

; eof
