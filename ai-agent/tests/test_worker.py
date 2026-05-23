import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


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


class WorkerSystemActionTests(unittest.TestCase):
    def _build_config(self, allowed_directory: str) -> object:
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
            device_id="",
            allowed_directory=allowed_directory,
            sandbox_enabled=True,
            sandbox_timeout_seconds=5,
            sandbox_max_ram_mb=256,
            sandbox_http_probe_port=8080,
        )

    def test_handle_system_action_rejects_unknown_actions(self):
        config = self._build_config(str(REPO_ROOT))

        with self.assertRaises(RuntimeError):
            worker.handle_system_action(config, action_type="run_shell", payload={})

    def test_system_file_list_stays_inside_allowed_directory(self):
        with tempfile.TemporaryDirectory() as tmp_dir:
            base = Path(tmp_dir)
            (base / "allowed.txt").write_text("ok", encoding="utf-8")
            config = self._build_config(str(base))

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


class WorkerSandboxTests(unittest.TestCase):
    def _build_config(self) -> object:
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
            device_id="",
            allowed_directory=str(REPO_ROOT),
            sandbox_enabled=True,
            sandbox_timeout_seconds=2,
            sandbox_max_ram_mb=256,
            sandbox_http_probe_port=8080,
        )

    def test_parse_critic_score(self):
        self.assertEqual(worker.parse_critic_score("SCORE: 9\nLooks good"), 9)
        self.assertIsNone(worker.parse_critic_score("score: 15"))
        self.assertIsNone(worker.parse_critic_score("No score here"))

    @patch.dict("os.environ", {"OPENAI_API_KEY": "secret-should-not-leak", "PATH": "/usr/bin"}, clear=False)
    def test_execute_in_safe_sandbox_strips_sensitive_env(self):
        config = self._build_config()
        seen_env: dict[str, str] = {}

        class DummyProcess:
            def __init__(self):
                self.pid = 99999

            def poll(self):
                return 0

            def communicate(self, timeout=None):
                return ("ok", "")

            def kill(self):
                return None

        def fake_popen(*args, **kwargs):
            seen_env.update(kwargs.get("env") or {})
            return DummyProcess()

        with patch.object(worker.subprocess, "Popen", side_effect=fake_popen):
            passed, logs, stats = worker.execute_in_safe_sandbox(config, "```python\nprint('ok')\n```")

        self.assertTrue(passed)
        self.assertIn("ok", logs)
        self.assertIn("PATH", seen_env)
        self.assertNotIn("OPENAI_API_KEY", seen_env)
        self.assertIn("boot_time_ms", stats)

    def test_execute_in_safe_sandbox_rejects_unsupported_language(self):
        config = self._build_config()
        passed, logs, _stats = worker.execute_in_safe_sandbox(config, "```ruby\nputs 'hi'\n```")
        self.assertFalse(passed)
        self.assertIn("Unsupported sandbox language", logs)


class SupabaseClientQuotaTests(unittest.TestCase):
    def test_consume_cloud_agent_quota_reads_rpc_response(self):
        client = worker.SupabaseRestClient("https://example.supabase.co", "service-role")

        with patch.object(client, "_request", return_value=[{"allowed": True, "uses_today": 1, "max_per_day": 5, "remaining": 4}]):
            result = client.consume_cloud_agent_quota("00000000-0000-0000-0000-000000000001")
        self.assertTrue(result["allowed"])
        self.assertEqual(result["remaining"], 4)

        with patch.object(client, "_request", return_value=[{"allowed": False, "uses_today": 5, "max_per_day": 5, "remaining": 0}]):
            result = client.consume_cloud_agent_quota("00000000-0000-0000-0000-000000000001")
        self.assertFalse(result["allowed"])
        self.assertEqual(result["remaining"], 0)


if __name__ == "__main__":
    unittest.main()
