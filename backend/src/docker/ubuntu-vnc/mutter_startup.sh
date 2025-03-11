#!/bin/bash

# Wait for X server to be ready
while ! xdpyinfo >/dev/null 2>&1; do
    sleep 0.1
done

echo "Starting mutter window manager..."
# Added --no-x11-warnings to suppress X11 protocol warnings
# Added --display=$DISPLAY to explicitly set display
# Added additional flags to improve stability in container environment
mutter --replace --sm-disable --x11 --no-x11-warnings --display=$DISPLAY \
  --wayland=no --nested=no &

# Wait for mutter to start
sleep 2

# Set desktop background color
xsetroot -solid "#2e3436"

# Ensure proper window manager settings
xset -dpms
xset s off
