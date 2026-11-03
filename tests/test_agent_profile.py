"""index.md and AGENTS.md stay exact copies of llms.txt, and job facts stay in it."""
from __future__ import annotations

import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AgentProfileTests(unittest.TestCase):
    def test_agent_profile_matches_llms_txt(self):
        subprocess.check_call(
            ["node", "scripts/sync-agent-profile.mjs", "--check"],
            cwd=ROOT,
        )


if __name__ == "__main__":
    unittest.main()
