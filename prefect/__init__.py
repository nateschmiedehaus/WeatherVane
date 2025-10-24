"""Lightweight Prefect compatibility layer for constrained environments.

This stub provides the minimal surface required by the WeatherVane worker flows
so the project can execute in environments where the real `prefect` package is
unavailable. It deliberately keeps behaviour simple—decorators become no-ops and
`get_run_logger` returns a standard library logger.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Callable, TypeVar


FuncT = TypeVar("FuncT", bound=Callable[..., Any])


def get_run_logger() -> logging.Logger:
    """Return a module-level logger compatible with Prefect's API."""

    logger = logging.getLogger("weathervane.prefect")
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter("[prefect] %(levelname)s %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger


def flow(
    func: FuncT | None = None,
    *,
    name: str | None = None,
    **options: Any,
) -> FuncT | Callable[[FuncT], FuncT]:
    """Drop-in replacement for `prefect.flow` decorator."""

    if func is None:
        return functools.partial(flow, name=name, **options)

    setattr(func, "__prefect_flow__", True)
    if name:
        setattr(func, "__prefect_name__", name)
    if options:
        setattr(func, "__prefect_options__", dict(options))
    # Mirror Prefect 2 API surface so call sites can use `.fn` or `.with_options`.
    setattr(func, "fn", func)

    def _with_options(**_: Any) -> FuncT:
        return func

    setattr(func, "with_options", _with_options)
    return func


def task(
    func: FuncT | None = None,
    *,
    name: str | None = None,
    **options: Any,
) -> FuncT | Callable[[FuncT], FuncT]:
    """Drop-in replacement for `prefect.task` decorator."""

    if func is None:
        return functools.partial(task, name=name, **options)

    setattr(func, "__prefect_task__", True)
    if name:
        setattr(func, "__prefect_name__", name)
    if options:
        setattr(func, "__prefect_options__", dict(options))
    setattr(func, "fn", func)

    def _with_options(**_: Any) -> FuncT:
        return func

    setattr(func, "with_options", _with_options)
    return func
