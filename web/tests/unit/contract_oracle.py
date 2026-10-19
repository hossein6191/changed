"""The contract's own pure helpers, answering for the site's tests.

tests/unit/*.test.mjs run this with `python3 -I` and a JSON list of calls on stdin, so the TypeScript
copies of the contract's rules (lib/rules.ts), the fingerprints the demo build gives the notices
(lib/demo-event.ts) and the in-memory contract's rules() are compared with contracts/changed.py
itself, not with a description of it. A stub stands in for the GenLayer runtime: nothing here touches
a network or a model.
"""

import importlib.util
import json
import pathlib
import sys
import types


def _stub():
    stub = types.ModuleType("genlayer")

    class _Any:
        def __getattr__(self, n):
            return _Any()

        def __call__(self, *a, **k):
            return _Any()

        def __getitem__(self, n):
            return _Any()

    class _UserError(Exception):
        pass

    class _VM:
        UserError = _UserError
        Return = object
        Result = object

    class _Public:
        view = staticmethod(lambda f: f)

        class _Write:
            def __call__(self, f):
                return f

            payable = staticmethod(lambda f: f)

        write = _Write()

    class _EVM:
        @staticmethod
        def contract_interface(c):
            return c

    class _GL:
        vm = _VM()
        public = _Public()
        evm = _EVM()

        class Contract:
            pass

        def __getattr__(self, n):
            return _Any()

    class _T:
        def __init__(self, *a, **k):
            pass

        def __class_getitem__(cls, item):
            return cls

    stub.gl = _GL()
    stub.allow_storage = lambda c: c
    stub.Address = str
    stub.DynArray = _T
    stub.TreeMap = _T
    stub.u256 = int
    stub.u32 = int
    stub.u64 = int
    stub.i64 = int
    stub.__all__ = ["gl", "allow_storage", "Address", "DynArray", "TreeMap", "u256", "u32", "u64", "i64"]
    sys.modules["genlayer"] = stub


def _load():
    _stub()
    path = pathlib.Path(__file__).resolve().parents[3] / "contracts" / "changed.py"
    spec = importlib.util.spec_from_file_location("changed", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


cc = _load()

ALLOWED = {"_text_problem", "_url_problem", "_prefix_problem", "_number_arg", "_terms_problem", "_under"}


def _fingerprint_of(html):
    """What every validator stores for a page whose body is these bytes: the contract's own reading."""
    page = cc._page_text(cc._visible(cc._decoded(html.encode("utf-8"))))
    return {"fp": cc._fingerprint(page), "chars": len(page)}


def answer(call):
    fn = call["fn"]
    args = call.get("args", [])
    if fn == "rules":
        return json.loads(cc.Changed.rules(None))
    if fn == "const":
        value = getattr(cc, args[0])
        return str(value) if isinstance(value, int) and not isinstance(value, bool) and abs(value) > 2 ** 53 else value
    if fn == "fingerprint":
        return _fingerprint_of(args[0])
    if fn not in ALLOWED:
        raise ValueError("not an allowed helper: " + fn)
    out = getattr(cc, fn)(*args)
    return list(out) if isinstance(out, tuple) else out


def main():
    calls = json.loads(sys.stdin.read())
    results = []
    for call in calls:
        try:
            results.append({"ok": answer(call)})
        except Exception as e:  # a helper that raises is an answer too
            results.append({"error": type(e).__name__ + ": " + str(e)})
    sys.stdout.write(json.dumps(results))


main()
