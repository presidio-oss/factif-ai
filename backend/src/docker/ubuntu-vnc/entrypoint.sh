#!/bin/bash
set -e

# Clean up any stale pid files
sudo rm -f /var/run/dbus/pid
sudo rm -f /var/run/dbus/system_bus_socket

# Start dbus daemon with sudo
sudo mkdir -p /var/run/dbus
sudo dbus-daemon --system --fork

# Start session dbus
export DBUS_SESSION_BUS_ADDRESS=$(dbus-daemon --session --fork --print-address)

# Ensure log directories exist with proper permissions
mkdir -p /tmp/x11vnc_logs /tmp/novnc_logs

# Start all VNC components with debug output
echo "Starting core VNC components..."
./start_all.sh || { echo "Failed to start core VNC components"; exit 1; }

# Check if the VNC server is running
if ! netstat -tuln | grep -q ":5900 "; then
  echo "ERROR: VNC server not running on port 5900 after start_all.sh"
  # Try to manually start x11vnc as a last resort
  x11vnc -display $DISPLAY -forever -shared -rfbport 5900 -nopw -xkb &
  sleep 3
fi

echo "Starting noVNC wrapper..."
./novnc_startup.sh || { echo "Failed to start noVNC service"; exit 1; }

echo "✨ VNC server is ready!"
echo "➡️  VNC server running on port 5900, noVNC on port 6080"

# Monitor logs in the background
tail -f /tmp/x11vnc_logs/x11vnc.log /tmp/novnc_logs/novnc.log &

# Keep the container running
tail -f /dev/null
