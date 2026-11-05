; Additions to electron-builder's assisted installer (package.json,
; build.nsis.include): a page after the folder choice that asks where to
; put the shortcuts. electron-builder makes both shortcuts itself; on a
; fresh install this removes the ones the user unchecked. Updates run
; silently, never show the page, and keep the shortcuts as they are.
;
; The texts follow the installer's language: Russian (LANGID 1049) or
; English. Everything is kept out of the uninstaller's build, where unused
; variables and functions would fail it (makensis runs with -WX).

!ifndef BUILD_UNINSTALLER
  Var desktopCheckbox
  Var startMenuCheckbox
  ; "0" once the user unchecks it; empty or "1" keeps the shortcut
  Var wantDesktopLink
  Var wantStartMenuLink
!endif

!macro customPageAfterChangeDir
  Page custom shortcutsPageShow shortcutsPageLeave

  Function shortcutsPageShow
    ${If} $LANGUAGE == 1049
      !insertmacro MUI_HEADER_TEXT "Ярлыки" "Где создать ярлыки Casual Enjoyer"
      StrCpy $1 "На рабочем столе"
      StrCpy $2 "В меню «Пуск»"
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Shortcuts" "Where to put shortcuts to Casual Enjoyer"
      StrCpy $1 "On the desktop"
      StrCpy $2 "In the Start menu"
    ${EndIf}

    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}

    ${NSD_CreateCheckbox} 0 0 100% 12u $1
    Pop $desktopCheckbox
    ${If} $wantDesktopLink != "0"
      ${NSD_Check} $desktopCheckbox
    ${EndIf}

    ${NSD_CreateCheckbox} 0 18u 100% 12u $2
    Pop $startMenuCheckbox
    ${If} $wantStartMenuLink != "0"
      ${NSD_Check} $startMenuCheckbox
    ${EndIf}

    nsDialogs::Show
  FunctionEnd

  Function shortcutsPageLeave
    ${NSD_GetState} $desktopCheckbox $wantDesktopLink
    ${NSD_GetState} $startMenuCheckbox $wantStartMenuLink
  FunctionEnd
!macroend

!macro customInstall
  ${ifNot} ${isUpdated}
    ${if} $wantDesktopLink == "0"
      WinShell::UninstShortcut "$newDesktopLink"
      Delete "$newDesktopLink"
    ${endIf}
    ${if} $wantStartMenuLink == "0"
      WinShell::UninstShortcut "$newStartMenuLink"
      Delete "$newStartMenuLink"
      ; The finish page would otherwise start the app through that shortcut
      StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${endIf}
  ${endIf}
!macroend
