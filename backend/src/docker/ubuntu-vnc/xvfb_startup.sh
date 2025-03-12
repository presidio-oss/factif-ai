#!/bin/bash

# Print debugging information
echo "Starting Xvfb with display: ${DISPLAY}, number: ${DISPLAY_NUM}, resolution: ${WIDTH}x${HEIGHT}"
echo "Current user: $(whoami), groups: $(groups)"
echo "Previous X lock files: $(ls -la /tmp/.X*-lock 2>/dev/null || echo 'None')"

# Remove any stale lock files that might be causing issues
echo "Cleaning up any stale X lock files..."
rm -f /tmp/.X${DISPLAY_NUM}-lock /tmp/.X11-unix/X${DISPLAY_NUM} 2>/dev/null || true
mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix

# Set variables with defaults in case they're not set
DPI=${DPI:-96}
DISPLAY_NUM=${DISPLAY_NUM:-99}
DISPLAY=${DISPLAY:-:${DISPLAY_NUM}}
WIDTH=${WIDTH:-1280}
HEIGHT=${HEIGHT:-720}
RES_AND_DEPTH="${WIDTH}x${HEIGHT}x24"

# Function to check if Xvfb is already running
check_xvfb_running() {
    if [ -e /tmp/.X${DISPLAY_NUM}-lock ]; then
        echo "Found existing lock file: /tmp/.X${DISPLAY_NUM}-lock"
        return 0  # Xvfb is already running
    else
        return 1  # Xvfb is not running
    fi
}

# Function to check if Xvfb is ready
wait_for_xvfb() {
    local timeout=30  # Increased timeout to 30 seconds
    local start_time=$(date +%s)
    
    echo "Waiting up to ${timeout} seconds for Xvfb to be ready..."
    
    while ! DISPLAY=${DISPLAY} xdpyinfo >/dev/null 2>&1; do
        local elapsed=$(($(date +%s) - start_time))
        if [ $elapsed -gt $timeout ]; then
            echo "ERROR: Xvfb failed to start within ${timeout} seconds" >&2
            echo "Last few lines of Xvfb output:" >&2
            tail -n 10 /tmp/xvfb_output.log 2>/dev/null || echo "No Xvfb logs available" >&2
            return 1
        fi
        
        # Output progress every 5 seconds
        if [ $((elapsed % 5)) -eq 0 ]; then
            echo "Still waiting for Xvfb... (${elapsed}/${timeout}s)"
            # Check if process is still running
            if ! ps -p $XVFB_PID >/dev/null; then
                echo "ERROR: Xvfb process exited unexpectedly!" >&2
                return 1
            fi
        fi
        
        sleep 0.5
    done
    
    echo "Xvfb is responding to xdpyinfo queries"
    return 0
}

# Check if Xvfb is already running
if check_xvfb_running; then
    echo "Xvfb appears to be already running on display ${DISPLAY}"
    
    # Test if it's actually working
    if DISPLAY=${DISPLAY} xdpyinfo >/dev/null 2>&1; then
        echo "Xvfb is operational on display ${DISPLAY}, reusing it"
        exit 0
    else
        echo "WARNING: Found lock file but Xvfb is not responding. Cleaning up..."
        rm -f /tmp/.X${DISPLAY_NUM}-lock /tmp/.X11-unix/X${DISPLAY_NUM} 2>/dev/null || true
    fi
fi

# Create a log file for Xvfb output
touch /tmp/xvfb_output.log
chmod 666 /tmp/xvfb_output.log

echo "Starting Xvfb on display ${DISPLAY} with resolution ${RES_AND_DEPTH}..."

# Start Xvfb with more explicit options and logging
Xvfb ${DISPLAY} -screen 0 ${RES_AND_DEPTH} -ac -dpi ${DPI} -retro -nolisten tcp > /tmp/xvfb_output.log 2>&1 &
XVFB_PID=$!

echo "Xvfb process started with PID: ${XVFB_PID}"

# Wait for Xvfb to start
if wait_for_xvfb; then
    echo "SUCCESS: Xvfb started successfully on display ${DISPLAY} with PID ${XVFB_PID}"
    # Set appropriate permissions for the X socket
    chmod 777 /tmp/.X11-unix/X${DISPLAY_NUM} 2>/dev/null || true
else
    echo "ERROR: Xvfb failed to start - check the logs at /tmp/xvfb_output.log"
    [ -n "${XVFB_PID}" ] && kill ${XVFB_PID} 2>/dev/null || true
    exit 1
fi

# Create a marker file to indicate successful startup
touch /tmp/xvfb_started_successfully
