#!/bin/bash

set -e

export DISPLAY=:${DISPLAY_NUM}
export XDG_RUNTIME_DIR=/tmp/runtime-$USERNAME

# Create runtime directory
mkdir -p $XDG_RUNTIME_DIR
chmod 700 $XDG_RUNTIME_DIR

# Create log directories
mkdir -p /tmp/x11vnc_logs /tmp/novnc_logs /tmp/tint2_logs /tmp/pcmanfm_logs

echo "Starting VNC services..."

# Start Xvfb
./xvfb_startup.sh

# Start window manager and panel
./mutter_startup.sh
sleep 2
./tint2_startup.sh

# Start PCManFM for desktop icons using our custom script
./pcmanfm_startup.sh

# Start VNC server
./x11vnc_startup.sh

echo "All VNC services started"
