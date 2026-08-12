@echo off
echo Starting LunoBackend Server in Debug Mode...
echo ==========================================
echo.
echo This will start the server and show all output
echo Press Ctrl+C to stop the server
echo.
echo Starting in 3 seconds...
timeout /t 3 /nobreak >nul
echo.
echo Starting server...
node server.js
echo.
echo Server stopped.
pause
