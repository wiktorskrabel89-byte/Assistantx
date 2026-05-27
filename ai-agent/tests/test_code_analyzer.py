import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "ai-agent" / "code_analyzer.py"


def load_module():
    spec = importlib.util.spec_from_file_location("assistantx_code_analyzer", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


code_analyzer = load_module()


class CodeAnalyzerTests(unittest.TestCase):
    def test_build_index_respects_root_gitignore(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = Path(tmp_dir) / "repo"
            repo.mkdir()
            (repo / ".gitignore").write_text("node_modules/\n", encoding="utf-8")
            (repo / "src").mkdir()
            (repo / "src" / "main.ts").write_text("export const ok = true;\n", encoding="utf-8")
            (repo / "node_modules").mkdir()
            (repo / "node_modules" / "ignored.js").write_text("console.log('nope')\n", encoding="utf-8")
            index_dir = Path(tmp_dir) / "index"

            meta = code_analyzer.build_index(repo, index_dir)

            self.assertEqual(meta["files_indexed"], 1)
            chunks = (index_dir / "chunks.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(chunks), 1)
            self.assertEqual(json.loads(chunks[0])["path"], "src/main.ts")

    def test_build_index_respects_nested_gitignore_and_negation(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            repo = Path(tmp_dir) / "repo"
            repo.mkdir()
            (repo / "packages" / "web" / "src").mkdir(parents=True)
            (repo / "packages" / "api").mkdir(parents=True)
            (repo / "packages" / "web" / ".gitignore").write_text("generated/\n!important.ts\n", encoding="utf-8")
            (repo / "packages" / "web" / "generated").mkdir()
            (repo / "packages" / "web" / "generated" / "skip.ts").write_text("export const skip = true;\n", encoding="utf-8")
            (repo / "packages" / "web" / "important.ts").write_text("export const keep = true;\n", encoding="utf-8")
            (repo / "packages" / "api" / "server.ts").write_text("export const api = true;\n", encoding="utf-8")
            index_dir = Path(tmp_dir) / "index"

            code_analyzer.build_index(repo, index_dir)
            indexed_paths = {
                json.loads(line)["path"]
                for line in (index_dir / "chunks.jsonl").read_text(encoding="utf-8").splitlines()
            }

            self.assertIn("packages/web/important.ts", indexed_paths)
            self.assertIn("packages/api/server.ts", indexed_paths)
            self.assertNotIn("packages/web/generated/skip.ts", indexed_paths)


if __name__ == "__main__":
    unittest.main()
