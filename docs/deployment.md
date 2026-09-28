# Deployment & Contabo Ubuntu Guide

## 1. Overview
ServerConsole is packaged with multi-stage Docker builds and Docker Compose for zero-downtime deployment to a single Ubuntu VPS (e.g., Contabo, Hetzner, DigitalOcean).

## 2. Deploying ServerConsole with Docker Compose

### On the Server:
1. Clone the repository:
   ```bash
   git clone <repo-url> /opt/server-console
   cd /opt/server-console
   ```
2. Generate production secrets:
   ```bash
   cp .env.example .env
   # Generate MASTER_KEY
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Start ServerConsole via Docker Compose:
   ```bash
   docker compose up -d --build
   ```
4. Access ServerConsole on `http://<your-vps-ip>` (or configure DNS and Let's Encrypt SSL via Nginx).

---

## 3. Configuring your Contabo VPS for VNC Remote Desktop

If you want to manage an Ubuntu Contabo VPS via VNC:

### 1. Install Desktop Environment (XFCE) & TigerVNC
On your Contabo server:
```bash
sudo apt update
sudo apt install -y xfce4 xfce4-goodies tigervnc-standalone-server
```

### 2. Set VNC Password
```bash
vncpasswd
```
(Enter and verify your VNC password; select "no" for view-only password).

### 3. Configure `~/.vnc/xstartup`
Create or edit `~/.vnc/xstartup`:
```bash
#!/bin/sh
unset SESSION_MANAGER
unset DBUS_SESSION_BUS_ADDRESS
exec startxfce4
```
Make it executable:
```bash
chmod +x ~/.vnc/xstartup
```

### 4. Start VNC Server
```bash
vncserver -localhost yes :1
```
*Note*: Using `-localhost yes` binds VNC to `127.0.0.1:5901` for security. ServerConsole can connect via SSH or internal networking. If ServerConsole connects externally from another host, allow port 5901 in your firewall (`ufw allow 5901/tcp`) and run `vncserver :1`.

### 5. Add Contabo Server to ServerConsole
1. Open ServerConsole
2. Click **Add Server**
3. Enter your Contabo Server IP
4. SSH Port: `22`, Username: `root` or `ubuntu`, Password or Private Key
5. Enable VNC: Port `5901`, VNC Password
6. Click **Test Connection** -> **Save Server**
