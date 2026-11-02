@echo off
rem Squeezy Audio Splitter: one-time engine setup (Windows)
setlocal
cd /d "%~dp0"
set "DIR=%~dp0"
echo ==================================================
echo  Squeezy Audio Splitter: one-time setup
echo  Downloads Python, PyTorch and two AI models
echo  (about 2 GB, 5-15 minutes). Keep this window open.
echo ==================================================
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
where uv >nul 2>nul || powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex" || goto fail
set "PATH=%USERPROFILE%\.local\bin;%PATH%"
if exist "%DIR%venv" rmdir /s /q "%DIR%venv"
uv venv --python 3.11 "%DIR%venv" || goto fail
uv pip install --python "%DIR%venv\Scripts\python.exe" torch torchaudio librosa soundfile huggingface_hub imageio-ffmpeg torch-complex typeguard rich pytorch_lightning "audio-separator[cpu]" setuptools || goto fail
powershell -NoProfile -Command "Invoke-WebRequest -UseBasicParsing https://github.com/JusperLee/TIGER/archive/refs/heads/main.zip -OutFile '%DIR%tiger.zip'" || goto fail
if exist "%DIR%TIGER" rmdir /s /q "%DIR%TIGER"
if exist "%DIR%TIGER-main" rmdir /s /q "%DIR%TIGER-main"
powershell -NoProfile -Command "Expand-Archive -Force '%DIR%tiger.zip' '%DIR%'" || goto fail
ren "%DIR%TIGER-main" TIGER || goto fail
del "%DIR%tiger.zip"
"%DIR%venv\Scripts\python.exe" "%DIR%split.py" --warmup || goto fail
echo ok> "%DIR%installed.txt"
echo.
echo Done! Go back to After Effects, select your layer and press Split.
pause
exit /b 0
:fail
echo.
echo Setup failed. Send a screenshot of this window to Claude.
pause
exit /b 1
