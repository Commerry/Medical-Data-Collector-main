!macro customInit
  ; Force close running app when reinstalling
  nsExec::ExecToLog 'taskkill /IM "${APP_EXECUTABLE_FILENAME}" /F'
  
  ; Uninstall previous version if it exists
  ReadRegStr $0 HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_GUID}" "UninstallString"
  
  ${If} $0 != ""
    DetailPrint "Uninstalling previous version..."
    ExecWait '$0 /S'
    Sleep 1000  ; Wait for uninstaller to finish
  ${EndIf}
!macroend

!macro customInstall
  ; Additional setup or cleanup after file extraction if needed
!macroend
