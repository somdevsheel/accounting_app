"""Standalone entrypoint used both by `python run_server.py` in dev and by the
PyInstaller-frozen build. `python -m uvicorn main:app` (used in dev/source
mode by electron/main.js) can't be frozen directly — PyInstaller freezes a
script, not a module invocation — so this is that script.

Importing the app module directly (rather than passing uvicorn.run() the
"main:app" string it normally takes) matters here: PyInstaller's static
analysis only bundles what it can see imported from the entry script. The
string form resolves the app lazily at runtime, which is invisible to that
analysis — main.py and everything it pulls in (models, routers, database)
would silently be left out of the frozen build."""
import argparse

import uvicorn

import main as app_module


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    uvicorn.run(app_module.app, host=args.host, port=args.port)


if __name__ == "__main__":
    run()
