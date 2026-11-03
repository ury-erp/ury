"""Pure tests for the URY Brief Huf seed (no frappe site needed)."""
import ast
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HUF = ROOT / "huf"
API = ROOT / "ury" / "api"
STOCK_MODELS = {"gemini-3-flash-preview", "gemini-flash-latest", "gemini-3.8-flash-tts"}


def _load(p):
	return json.loads(Path(p).read_text())


def _const(path, name):
	for n in ast.parse(Path(path).read_text()).body:
		if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id == name:
			return ast.literal_eval(n.value)


def _tool_names():
	"""Names are func.__name__ of the first arg of each _entry(...) call inside TOOLS."""
	for n in ast.parse((API / "chairman_tools.py").read_text()).body:
		if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id == "TOOLS":
			return {c.args[0].id for c in n.value.elts if isinstance(c, ast.Call)}


class TestBriefSeed(unittest.TestCase):
	def test_all_json_parses(self):
		files = list(HUF.rglob("*.json"))
		self.assertTrue(files)
		for f in files:
			_load(f)

	def test_tools_match_chairman_tools(self):
		names = _tool_names()
		self.assertEqual(len(names), 14)
		prefixed = {"ury_chairman_" + n for n in names}
		seeded = {_load(f)["tool_name"] for f in (HUF / "tools").glob("*.json")}
		self.assertEqual(seeded, prefixed)
		agent = _load(HUF / "agents" / "ury_chairman_assistant.json")
		self.assertEqual(set(agent["tools"]), prefixed)
		self.assertEqual(len(agent["tools"]), len(prefixed))

	def test_agent_models(self):
		a = _load(HUF / "agents" / "ury_chairman_assistant.json")
		self.assertEqual(a["provider"], "Google")
		self.assertIn(a["model"], STOCK_MODELS)
		self.assertIn(a["stt_model"], STOCK_MODELS)
		self.assertIn(a["tts_model"], STOCK_MODELS)
		self.assertTrue(a["tts_voice"])

	def test_prompts_match_python_constants(self):
		ins = _const(API / "chairman_seed.py", "INSTRUCTIONS")
		vs = _const(API / "chairman_call.py", "VOICE_STYLE_RULES")
		p = {f.stem: _load(f) for f in (HUF / "prompts").glob("*.json")}
		self.assertEqual(p["ury_chairman_agent_instructions"]["prompt_body"], ins)
		self.assertEqual(p["ury_chairman_voice_style_rules"]["prompt_body"], vs)
		for d in p.values():
			self.assertTrue(d["title"] and d["slug"])
		self.assertEqual(_load(HUF / "agents" / "ury_chairman_assistant.json")["instructions"], ins)
