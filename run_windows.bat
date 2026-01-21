@echo off
setlocal

set "PROJECT_NAME=YIXZ-MCP"

title %PROJECT_NAME% - Startup Script

echo ==========================================
echo    %PROJECT_NAME% - Windows Startup
echo ==========================================
echo.

REM Check Method 1: Direct node execution (most reliable)
node -v >nul 2>&1
if %errorlevel% equ 0 goto NODE_FOUND

REM Check Method 2: where command
where node >nul 2>&1
if %errorlevel% equ 0 goto NODE_FOUND

REM Check Method 3: Common installation paths
if exist "C:\Program Files\nodejs\node.exe" goto NODE_FOUND
if exist "C:\Program Files (x86)\nodejs\node.exe" goto NODE_FOUND

REM Node.js not found
echo [ERROR] Node.js not found
echo.
echo Please install Node.js (v18+)
echo Download: https://nodejs.org/
echo.
echo If Node.js is already installed but not detected:
echo 1. Add Node.js to PATH: C:\Program Files\nodejs\
echo 2. Restart your computer after installation
echo 3. Try running this script as Administrator
echo.
pause
exit /b 1

:NODE_FOUND
for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo [INFO] Node.js: %NODE_VERSION%
echo.

REM Detect package manager
where pnpm >nul 2>&1
if %errorlevel% equ 0 (
    if exist "pnpm-lock.yaml" (
        set "PM=pnpm"
        echo [INFO] Using pnpm
    ) else (
        set "PM=npm"
        echo [INFO] Using npm
    )
) else (
    set "PM=npm"
    echo [INFO] Using npm
)
echo.

REM Install dependencies if needed
if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    call %PM% install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install dependencies
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)
echo.

REM Build frontend if needed
if not exist "dist" (
    echo [INFO] Building frontend...
    call %PM% run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed
        pause
        exit /b 1
    )
    echo [OK] Frontend built
) else (
    echo [OK] Frontend already built
)
echo.

REM Start service
set "URL=http://localhost:3001"
echo ==========================================
echo  Starting Service
echo ==========================================
echo.
echo URL: %URL%
echo Stop: Ctrl + C
echo.
echo [INFO] Starting service in background...

REM Start service in background
start /B cmd /c "%PM% start >nul 2>&1"

REM Wait for service to be ready (up to 30 seconds)
echo [INFO] Waiting for service to start...
set "MAX_WAIT=30"
set "WAIT_COUNT=0"

:WAIT_LOOP
REM Check if port 3001 is listening
netstat -an | findstr ":3001.*LISTENING" >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Service is ready!
    goto SERVICE_READY
)

timeout /t 1 >nul
set /a WAIT_COUNT+=1

if %WAIT_COUNT% geq %MAX_WAIT% (
    echo [WARN] Service may not be fully ready, but continuing...
    goto SERVICE_READY
)

goto WAIT_LOOP

:SERVICE_READY
echo.
echo [INFO] Opening browser...
start "" "%URL%"

timeout /t 1 >nul

echo.
echo [RUNNING] Service is running
echo.
echo [INFO] Press Ctrl + C to stop the service
echo [INFO] Or just close this window (service will continue in background)
echo.
echo [TIP] To stop the background service, run: taskkill /F /IM node.exe
echo.

REM Keep window open
pause
