Version: 2025-10-25

# WeatherVane Coding Style (Autopilot Scope)

1. **Language Conventions**
   - TypeScript/Node: ES2022 modules, strict mode, named exports where possible.
   - Python: Ruff/Black defaults, snake_case for functions/variables, PascalCase for classes.

2. **Prompts & Memory**
   - System prompts remain ASCII, deterministic headers.
   - Scoped memory keys follow `agent:purpose` naming to avoid collisions.

3. **Testing**
   - Use `vitest` for TS packages, `pytest` for Python, keep tests near implementation.
   - Tests should run without network access unless fixtures mock responses.

4. **Observability**
   - Prefer `logInfo/logWarning/logError` wrappers.
   - Capture run IDs in logs where available.
