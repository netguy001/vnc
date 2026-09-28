# Local Development Guide

## Prerequisites
- **Operating System**: Windows 11, macOS, or Linux
- **Node.js**: v20.0.0 or higher (v22 recommended)
- **npm**: v10.0.0 or higher

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure your `MASTER_KEY` is a 64-character hex string (32 bytes). You can generate one via:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Run the Development Environment
Run backend and frontend simultaneously:
```bash
npm run dev
```
- Backend runs on `http://localhost:3001`
- Frontend runs on `http://localhost:5173`

On initial launch, visit `http://localhost:5173`. You will be greeted with the Initial Administrator Setup screen to create your admin account.

### 4. Running the Local Test Servers (Mock VNC + SSH)
To test VNC and SSH connectivity locally without a remote server:
```bash
npm run test:mock
```
This launches:
- **Mock VNC Server**: `127.0.0.1:5901` (RFB 3.8 protocol, no password)
- **Mock SSH & SFTP Server**: `127.0.0.1:2222` (User: `admin`, Password: `admin`)

In ServerConsole:
1. Click **Add Server**
2. Name: `Local Test Server`
3. Host: `127.0.0.1`, SSH Port: `2222`, Username: `admin`, Password: `admin`
4. Enable VNC: Port `5901`
5. Click **Save Server**
6. Open **VNC Console**, **Terminal**, **SFTP Files**, and **Telemetry** to test all features live!

### 5. Running Automated Tests
```bash
npm test
```
