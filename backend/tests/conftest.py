import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
# main.py mounts "static" relative to the working directory.
os.chdir(BACKEND_DIR)
