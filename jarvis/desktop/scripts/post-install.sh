#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${1:-/Applications/Jarvis.app}"
APP_NAME="Jarvis"
PLIST_DIR="${HOME}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/com.assistantx.jarvis.desktop.autostart.plist"

mkdir -p "${PLIST_DIR}"

cat > "${PLIST_PATH}" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.assistantx.jarvis.desktop.autostart</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/bin/open</string>
      <string>-a</string>
      <string>${APP_NAME}</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
  </dict>
</plist>
PLIST

launchctl unload "${PLIST_PATH}" >/dev/null 2>&1 || true
launchctl load "${PLIST_PATH}" >/dev/null 2>&1 || true

echo "Created LaunchAgent at ${PLIST_PATH}"
