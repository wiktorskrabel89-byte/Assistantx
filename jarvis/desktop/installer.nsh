; ── Jarvis custom NSIS installer hook ────────────────────────────────────
; Called by electron-builder at the end of the install section.
; Runs the bundled post-install.ps1 to:
;   • create a Windows Startup shortcut (autostart)
;   • disable Fast Startup (HiberbootEnabled = 0)
;   • disable hibernation (powercfg /h off)

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
