# AFP Tests Virtual Environment

Use a local virtual environment to run Python-based integrity and guard suites without contaminating the repo:

```bash
python3 -m venv state/py/afp-tests/venv
source state/py/afp-tests/venv/bin/activate
pip install -r requirements.txt
```

Artifact directories under `state/py/afp-tests/venv/` are ignored via `.gitignore`.
