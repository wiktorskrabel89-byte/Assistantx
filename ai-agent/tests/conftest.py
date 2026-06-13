"""Make the ai-agent sidecar modules importable from tests.

The directory name contains a hyphen, so it cannot be imported as a package;
the sidecar itself runs with this directory as the working directory. Tests
mirror that by putting it on sys.path.
"""

import sys
from pathlib import Path

AI_AGENT_DIR = Path(__file__).resolve().parents[1]
if str(AI_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(AI_AGENT_DIR))
