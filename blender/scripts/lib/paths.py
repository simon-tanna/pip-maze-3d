"""Repo-relative paths shared by every Blender script (scripts run with cwd = repo root)."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
SOURCE_DIR = REPO_ROOT / "blender" / "source"  # hand-authored .blend files
MODELS_DIR = REPO_ROOT / "public" / "models"  # exported .glb, served at /models/<name>.glb
