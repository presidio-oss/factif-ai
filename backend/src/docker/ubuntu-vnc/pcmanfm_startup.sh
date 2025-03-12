#!/bin/bash
set -e

echo "Starting PCManFM desktop manager..."

# Create a log directory if it doesn't exist
mkdir -p /tmp/pcmanfm_logs

# Start PCManFM with desktop mode and redirect warnings to log file
pcmanfm --desktop --profile factif > /tmp/pcmanfm_logs/pcmanfm.log 2>&1 &

# Wait briefly to ensure it starts properly
sleep 1

# Check if PCManFM is running
if pgrep -x "pcmanfm" > /dev/null; then
    echo "PCManFM desktop manager started successfully"
else
    echo "Warning: PCManFM desktop manager may have failed to start"
fi

# Create a default profile to reduce warnings
mkdir -p $HOME/.config/pcmanfm/factif
cat > $HOME/.config/pcmanfm/factif/pcmanfm.conf << EOF
[config]
show_desktop=1
desktop_bg=#2e3436
desktop_fg=#ffffff
desktop_shadow=#000000
desktop_font=Sans 12
show_wm_menu=0
sort_type=name
sort_by=ascending
EOF
