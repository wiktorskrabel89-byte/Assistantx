; ── Jarvis custom NSIS installer hooks ───────────────────────────────────
; customInstall  – called by electron-builder at the end of the install section.
; customUninstall – called by electron-builder at the start of the uninstall section.
;
; post-install.ps1 (install):
;   • create a Windows Startup shortcut (autostart)
;   • disable Fast Startup (HiberbootEnabled = 0)
;   • disable hibernation (powercfg /h off)
;
; uninstall.ps1 (uninstall):
;   • remove the Windows Startup shortcut created during install

!macro customInstall
  DetailPrint "Running Jarvis post-install configuration..."

  ; PowerShell is at a known path on all supported Windows versions
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" \
    -NoProfile -ExecutionPolicy Bypass \
    -File "$INSTDIR\resources\post-install.ps1" \
    -InstallDir "$INSTDIR"'
  Pop $0

  ${If} $0 != 0
    DetailPrint "Post-install setup returned exit code $0 (non-fatal)"
  ${Else}
    DetailPrint "Post-install configuration completed successfully."
  ${EndIf}
!macroend

!macro customUninstall
  DetailPrint "Running Jarvis uninstall cleanup..."

  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" \
    -NoProfile -ExecutionPolicy Bypass \
    -File "$INSTDIR\resources\uninstall.ps1" \
    -InstallDir "$INSTDIR"'
  Pop $0

  ${If} $0 != 0
    DetailPrint "Uninstall cleanup returned exit code $0 (non-fatal)"
  ${Else}
    DetailPrint "Uninstall cleanup completed successfully."
  ${EndIf}
!macroend
