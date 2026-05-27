import importlib.util
import sys
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = REPO_ROOT / "ai-agent" / "action_hub.py"


def load_module():
    spec = importlib.util.spec_from_file_location("assistantx_action_hub", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


action_hub = load_module()


class ActionHubTests(unittest.IsolatedAsyncioTestCase):
    def test_normalize_legacy_payload(self):
        normalized = action_hub.normalize_action_payload({
            "tool": "web_search",
            "query": "assistantx",
            "requestId": "req-1",
        })
        self.assertEqual(normalized["action_type"], "web_search")
        self.assertEqual(normalized["params"]["query"], "assistantx")
        self.assertEqual(normalized["request_id"], "req-1")

    def test_rejects_unknown_action(self):
        with self.assertRaises(action_hub.ActionError) as context:
            action_hub.normalize_action_payload({
                "tool": "jarvis_executor",
                "action": {
                    "schema_version": action_hub.SCHEMA_VERSION,
                    "action_type": "unknown_action",
                    "params": {},
                },
            })
        self.assertEqual(context.exception.code, action_hub.ERROR_UNKNOWN_ACTION)

    def test_rejects_missing_query(self):
        with self.assertRaises(action_hub.ActionError) as context:
            action_hub.normalize_action_payload({
                "tool": "jarvis_executor",
                "action": {
                    "schema_version": action_hub.SCHEMA_VERSION,
                    "action_type": "web_search",
                    "params": {},
                },
            })
        self.assertEqual(context.exception.code, action_hub.ERROR_INVALID_PARAMS)

    async def test_dispatches_canonical_action(self):
        async def handler(params):
            return [{"title": params["query"]}]

        result = await action_hub.dispatch_action({
            "tool": "jarvis_executor",
            "action": {
                "schema_version": action_hub.SCHEMA_VERSION,
                "action_type": "web_search",
                "params": {"query": "assistantx"},
                "request_id": "req-2",
                "source": "desktop",
            },
        }, {"web_search": handler})
        self.assertTrue(result["ok"])
        self.assertEqual(result["action_type"], "web_search")
        self.assertEqual(result["request_id"], "req-2")
        self.assertEqual(result["result"][0]["title"], "assistantx")

    def test_formats_stable_errors(self):
        payload = action_hub.format_action_error(
            action_hub.ActionError(action_hub.ERROR_INVALID_PARAMS, "bad params", {"field": "query"}),
            action_type="web_search",
            request_id="req-3",
        )
        self.assertEqual(payload["error"]["code"], action_hub.ERROR_INVALID_PARAMS)
        self.assertEqual(payload["action_type"], "web_search")
        self.assertEqual(payload["request_id"], "req-3")


if __name__ == "__main__":
    unittest.main()
