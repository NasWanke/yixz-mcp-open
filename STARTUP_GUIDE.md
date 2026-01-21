# Quick Start Guide

This guide helps you get started with YIXZ-MCP in minutes.

## Choose Your Deployment Method

### Option 1: Windows (Recommended for beginners)
1. Double-click `run_windows.bat`
2. Wait for automatic setup
3. Browser opens automatically at http://localhost:3001

### Option 2: Mac/Linux (Recommended for beginners)
```bash
chmod +x run_mac.sh
./run_mac.sh
```
Browser opens automatically at http://localhost:3001

### Option 3: Docker (Recommended for servers)
```bash
docker-compose up -d --build
```
Access at http://localhost:3001

### Option 4: Manual (For developers)
```bash
npm install
npm run build
npm start
```

## Troubleshooting

**Problem:** "Node.js not found"
**Solution:** Install Node.js v18+ from https://nodejs.org/

**Problem:** "Failed to install dependencies"
**Solution:** Check your internet connection or try: `npm install --registry=https://registry.npmmirror.com`

**Problem:** "Build failed"
**Solution:** Make sure you have a stable internet connection and try again

## Need Help?

- Check the full README.md for detailed instructions
- Open an issue on GitHub
- Join our community forum
