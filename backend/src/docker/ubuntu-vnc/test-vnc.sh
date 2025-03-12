#!/bin/bash

echo "Testing Docker VNC implementation"
echo "================================="

# Clean up any existing container
echo "Removing any existing container..."
docker rm -f factif-vnc 2>/dev/null || echo "No container to remove"

# Create and start a new container
echo "Starting new container..."
CONTAINER_ID=$(docker run -d --name factif-vnc -p 5900:5900 -p 6080:6080 factif-ubuntu-vnc)
echo "Container ID: $CONTAINER_ID"

# Wait longer for container to fully initialize
echo "Waiting for container to initialize..."
sleep 10

# Check if container is running
if docker ps | grep -q factif-vnc; then
    echo "✅ Container is running"
else
    echo "❌ Container failed to start"
    exit 1
fi

# Check logs
echo -e "\nContainer logs:"
echo "================="
docker logs factif-vnc

# Check X server
echo -e "\nChecking X server status..."
if docker exec factif-vnc xdpyinfo >/dev/null 2>&1; then
    echo "✅ X server is running"
else
    echo "❌ X server is not running"
    
    # Check X startup logs
    echo -e "\nX server startup logs:"
    docker exec factif-vnc cat /tmp/xvfb_output.log 2>/dev/null || echo "No X server logs available"
fi

# Check VNC service with more detailed output
echo -e "\nChecking VNC service..."
VNC_CHECK=$(docker exec factif-vnc netstat -tuln | grep -E '5900|:5900')
if [[ ! -z "$VNC_CHECK" ]]; then
    echo "✅ VNC service is running on port 5900"
    echo "   $VNC_CHECK"
else
    echo "❌ VNC service is not running on port 5900"
    echo "   Trying to manually start VNC service..."
    docker exec -d factif-vnc x11vnc -display :99 -forever -shared -rfbport 5900 -nopw -xkb
    sleep 3
    VNC_CHECK=$(docker exec factif-vnc netstat -tuln | grep -E '5900|:5900')
    if [[ ! -z "$VNC_CHECK" ]]; then
        echo "✅ VNC service now running on port 5900"
        echo "   $VNC_CHECK"
    fi
fi

# Check noVNC service with more detailed output
echo -e "\nChecking noVNC service..."
NOVNC_CHECK=$(docker exec factif-vnc netstat -tuln | grep -E '6080|:6080')
if [[ ! -z "$NOVNC_CHECK" ]]; then
    echo "✅ noVNC service is running on port 6080"
    echo "   $NOVNC_CHECK"
else
    echo "❌ noVNC service is not running on port 6080"
    echo "   Trying to manually start noVNC service..."
    docker exec -d factif-vnc websockify --web /opt/noVNC 6080 localhost:5900
    sleep 3
    NOVNC_CHECK=$(docker exec factif-vnc netstat -tuln | grep -E '6080|:6080')
    if [[ ! -z "$NOVNC_CHECK" ]]; then
        echo "✅ noVNC service now running on port 6080"
        echo "   $NOVNC_CHECK"
    fi
fi

echo -e "\nVNC connection URL: http://localhost:6080/vnc.html"
echo "Test complete."
