; Extend electron-builder's assisted NSIS installer, keeping its safe file,
; registry, upgrade, running-app and uninstall behavior.
!include nsDialogs.nsh
!include MUI2.nsh

!define MUI_WELCOMEPAGE_TITLE "Welcome to VYORA Setup"
!define MUI_WELCOMEPAGE_TEXT "Capture the moment. Keep the feeling.$\r$\n$\r$\nThis wizard will guide you through installing VYORA, your offline photo booth.$\r$\n$\r$\nPlease review the testing terms and privacy notice on the next page."
!define MUI_LICENSEPAGE_TEXT_TOP "Please read the testing terms, privacy information, and testing notice."
!define MUI_FINISHPAGE_TITLE "VYORA is ready"
!define MUI_FINISHPAGE_TEXT "VYORA has been installed on your computer.$\r$\n$\r$\nChoose Finish to close Setup. Leave Launch VYORA selected to open the app.$\r$\n$\r$\nYour photos stay on this computer."
!define MUI_FINISHPAGE_RUN_TEXT "Launch VYORA"

!macro customWelcomePage
  !insertmacro MUI_PAGE_WELCOME
!macroend

!ifndef BUILD_UNINSTALLER
  Var vyoraShortcutCheckbox
  Var vyoraDesktopShortcut
  Var vyoraOptionsDialog

  Function VyoraShortcutPage
    !insertmacro MUI_HEADER_TEXT "Shortcuts" "Choose how you want to open VYORA."
    nsDialogs::Create 1018
    Pop $vyoraOptionsDialog
    ${If} $vyoraOptionsDialog == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 25u "A Start menu shortcut will be created for your Windows account."
    Pop $0
    ${NSD_CreateCheckbox} 0 38u 100% 16u "Create a desktop shortcut"
    Pop $vyoraShortcutCheckbox
    ${NSD_SetState} $vyoraShortcutCheckbox $vyoraDesktopShortcut
    ${NSD_CreateLabel} 0 72u 100% 48u "VYORA saves photos and settings in your Windows user profile. Uninstalling the app will keep that data."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function VyoraShortcutPageLeave
    ${NSD_GetState} $vyoraShortcutCheckbox $vyoraDesktopShortcut
  FunctionEnd

  !macro customInit
    StrCpy $vyoraDesktopShortcut ${BST_CHECKED}
  !macroend

  !macro customPageAfterChangeDir
    Page custom VyoraShortcutPage VyoraShortcutPageLeave
  !macroend

  !macro customInstall
    ${IfNot} ${Silent}
    ${AndIf} $vyoraDesktopShortcut == ${BST_UNCHECKED}
      ; Only the app's known shortcut is affected by the user's explicit choice.
      Delete "$newDesktopLink"
    ${EndIf}
  !macroend
!endif
