#!/bin/bash
set -e

# Start SSH daemon
/usr/sbin/sshd

# Start TigerVNC server on display :0 (port 5900)
vncserver :0 -geometry 1280x800 -depth 24 -rfbport 5900 -SecurityTypes VncAuth

echo "=================================================="
echo " Ubuntu 24.04 + XFCE4 Test Server Started!"
echo " SSH Port: 22 (user: root, pass: secret)"
echo " VNC Port: 5900 (password: secret)"
echo "=================================================="

# Keep alive
tail -f /root/.vnc/*.log
