import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path("/home/runner/work/Assistantx/Assistantx")
WORKER_PATH = REPO_ROOT / "ai-agent" / "worker.py"


def load_worker_module():
    spec = importlib.util.spec_from_file_location("assistantx_worker", WORKER_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


worker = load_worker_module()


class WorkerTests(unittest.TestCase):
    def build_config(self, workspace_root: str | None = None):
        root = workspace_root or str(REPO_ROOT)
        return worker.WorkerConfig(
            supabase_url="https://example.supabase.co",
            supabase_key="service-role",
            supabase_auth_token="",
            ollama_base_url="http://localhost:11434",
            ollama_model="qwen2.5:14b",
            ollama_light_model="qwen2.5:14b",
            ollama_heavy_model="qwen2.5-coder:32b",
            ollama_light_keep_alive="10m",
            ollama_heavy_keep_alive="20m",
            ollama_timeout_seconds=30,
            ollama_retries=1,
            openrouter_api_key="",
            cloud_model="qwen/qwen-2.5-14b-instruct",
            cloud_timeout_seconds=30,
            cloud_retries=1,
            poll_interval_seconds=1.0,
            local_max_processing=1,
            task_pick_timeout_seconds=10,
            source_code_max_chars=4096,
            default_temperature=0.0,
            local_enabled=True,
            worker_device_id="",
            workspace_root=root,
            action_roots=(root,),
            allowed_directory=root,
        )

    def test_handle_system_action_rejects_unknown_actions(self):
        config = self.build_config()
        with self.assertRaises(RuntimeError):
            worker.handle_system_action(config, action_type="run_shell", payload={})

    def test_system_file_list_stays_inside_allowed_directory(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            base = Path(tmp_dir)
            (base / "allowed.txt").write_text("ok", encoding="utf-8")
            config = self.build_config(str(base))

            output = worker.handle_system_action(
                config,
                action_type="system_file_list",
                payload={"path": "."},
            )
            parsed = json.loads(output)
            self.assertEqual(parsed["path"], str(base.resolve()))
            self.assertEqual(parsed["entries"][0]["name"], "allowed.txt")

            with self.assertRaises(RuntimeError):
                worker.handle_system_action(
                    config,
                    action_type="system_file_list",
                    payload={"path": "../"},
                )

    def test_system_status_ping_returns_json_payload(self):
        output = worker._system_status_ping()
        parsed = json.loads(output)
        self.assertIn("platform", parsed)
        self.assertIn("memory", parsed)
        self.assertIn("gpu", parsed)

    def test_prompt_is_dangerous_matches_destructive_phrases(self):
        self.assertTrue(worker._prompt_is_dangerous("Usuń folder build"))
        self.assertFalse(worker._prompt_is_dangerous("Otwórz Roblox"))


if __name__ == "__main__":
    unittest.main()
