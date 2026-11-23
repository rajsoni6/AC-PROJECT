@echo off
echo ============================================
echo   VerifyVote Backend Server
echo   http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo ============================================
cd /d %~dp0
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
pause
