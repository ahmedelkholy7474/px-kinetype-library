#!/bin/bash
# Squeezy Audio Splitter: one-time engine setup (macOS)
cd "$(dirname "$0")" || exit 1
DIR="$(pwd)"
fail() { echo; echo "Setup failed: $1"; echo "Send a screenshot of this window to Claude."; read -r -p "Press Enter to close"; exit 1; }
echo "=================================================="
echo " Squeezy Audio Splitter: one-time setup"
echo " Downloads Python, PyTorch and two AI models"
echo " (about 2 GB, 5-15 minutes). Keep this window open."
echo "=================================================="
export PATH="$HOME/.local/bin:$PATH"
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh || fail "could not install uv"
  export PATH="$HOME/.local/bin:$PATH"
fi
rm -rf "$DIR/venv"
uv venv --python 3.11 "$DIR/venv" || fail "could not create the Python environment"
uv pip install --python "$DIR/venv/bin/python" torch torchaudio librosa soundfile huggingface_hub imageio-ffmpeg \
  torch-complex typeguard rich pytorch_lightning "audio-separator[cpu]" setuptools || fail "could not install the Python packages"
curl -L -o "$DIR/tiger.zip" https://github.com/JusperLee/TIGER/archive/refs/heads/main.zip || fail "could not download TIGER"
rm -rf "$DIR/TIGER" "$DIR/TIGER-main"
unzip -q -o "$DIR/tiger.zip" -d "$DIR" && mv "$DIR/TIGER-main" "$DIR/TIGER" && rm -f "$DIR/tiger.zip" || fail "could not unpack TIGER"
"$DIR/venv/bin/python" "$DIR/split.py" --warmup || fail "could not download the models"
date > "$DIR/installed.txt"
echo
echo "Done! Go back to After Effects, select your layer and press Split."
read -r -p "Press Enter to close"
