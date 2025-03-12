#!/bin/bash
set -e

echo "Starting tint2 panel..."

# Create a log directory if it doesn't exist
mkdir -p /tmp/tint2_logs

# Redirect warnings and errors to log file instead of console
tint2 -c $HOME/.config/tint2/tint2rc > /tmp/tint2_logs/tint2.log 2>&1 &

# Wait briefly to ensure it starts properly
sleep 1

# Check if tint2 is running
if pgrep -x "tint2" > /dev/null; then
    echo "tint2 panel started successfully"
else
    echo "Warning: tint2 panel may have failed to start"
fi
