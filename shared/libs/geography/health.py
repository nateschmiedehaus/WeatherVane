"""
Crash-proof health check for geography/Shapely dependencies.

This module provides safe wrappers around Shapely imports that fail gracefully
with descriptive errors instead of segfaults.
"""
import ctypes.util
import importlib.util
import sys
from typing import Dict


def check_geos_available() -> Dict[str, any]:
    """
    Check if GEOS library is available without importing Shapely.

    Returns:
        dict with 'available', 'path', 'error' keys
    """
    result = {
        'available': False,
        'path': None,
        'error': None
    }

    try:
        geos_path = ctypes.util.find_library('geos_c')
        if geos_path:
            result['available'] = True
            result['path'] = geos_path
        else:
            result['error'] = "GEOS library not found. Install GEOS or reinstall Shapely with: pip install --force-reinstall shapely"
    except Exception as e:
        result['error'] = f"Error probing for GEOS: {str(e)}"

    return result


def check_shapely_installed() -> Dict[str, any]:
    """
    Check if Shapely is installed without importing it.

    Returns:
        dict with 'installed', 'version', 'error' keys
    """
    result = {
        'installed': False,
        'version': None,
        'error': None
    }

    try:
        spec = importlib.util.find_spec("shapely")
        if spec is None:
            result['error'] = "Shapely not installed. Install with: pip install shapely>=2.0.0"
            return result

        # Try to get version without importing (safer)
        import subprocess
        try:
            output = subprocess.check_output(
                [sys.executable, "-c", "import shapely; print(shapely.__version__)"],
                stderr=subprocess.STDOUT,
                timeout=5,
                text=True
            )
            result['installed'] = True
            result['version'] = output.strip()
        except subprocess.CalledProcessError as e:
            result['error'] = f"Shapely import failed: {e.output}"
        except subprocess.TimeoutExpired:
            result['error'] = "Shapely import timed out (possible segfault)"

    except Exception as e:
        result['error'] = f"Error checking Shapely: {str(e)}"

    return result


def safe_shapely_import() -> Dict[str, any]:
    """
    Attempt to import Shapely with detailed error reporting.

    Returns:
        dict with 'success', 'error', 'details' keys
    """
    result = {
        'success': False,
        'error': None,
        'details': {}
    }

    # Check GEOS first
    geos_check = check_geos_available()
    result['details']['geos'] = geos_check

    if not geos_check['available']:
        result['error'] = geos_check['error']
        return result

    # Check Shapely installed
    shapely_check = check_shapely_installed()
    result['details']['shapely'] = shapely_check

    if not shapely_check['installed']:
        result['error'] = shapely_check['error']
        return result

    # Try actual import
    try:
        import shapely
        from shapely.geometry import Point

        # Test basic functionality
        p = Point(0, 0)
        assert p.x == 0 and p.y == 0

        result['success'] = True
        result['details']['version'] = shapely.__version__
        result['details']['test_passed'] = True

    except Exception as e:
        result['error'] = f"Shapely import failed: {type(e).__name__}: {str(e)}"
        result['details']['exception'] = str(e)

    return result


def health_check() -> Dict[str, any]:
    """
    Comprehensive health check for geography dependencies.

    Returns:
        dict with 'healthy', 'checks', 'errors' keys
    """
    result = {
        'healthy': False,
        'checks': {},
        'errors': []
    }

    # Check GEOS
    geos_check = check_geos_available()
    result['checks']['geos'] = geos_check
    if not geos_check['available']:
        result['errors'].append(f"GEOS: {geos_check['error']}")

    # Check Shapely
    shapely_check = check_shapely_installed()
    result['checks']['shapely_installed'] = shapely_check
    if not shapely_check['installed']:
        result['errors'].append(f"Shapely: {shapely_check['error']}")

    # Try import
    if geos_check['available'] and shapely_check['installed']:
        import_check = safe_shapely_import()
        result['checks']['shapely_import'] = import_check
        if not import_check['success']:
            result['errors'].append(f"Import: {import_check['error']}")
        else:
            result['healthy'] = True

    return result


def require_healthy_environment() -> None:
    """
    Raise exception if geography environment is not healthy.

    Raises:
        RuntimeError: If environment check fails
    """
    health = health_check()

    if not health['healthy']:
        error_msg = "Geography environment not healthy:\n"
        for error in health['errors']:
            error_msg += f"  - {error}\n"
        error_msg += "\nFix instructions:\n"
        error_msg += "  1. Install GEOS: brew install geos (macOS) or apt-get install libgeos-dev (Linux)\n"
        error_msg += "  2. Reinstall Shapely: pip install --force-reinstall shapely>=2.0.0\n"
        error_msg += "  3. Verify: python -c 'from shared.libs.geography.health import health_check; print(health_check())'\n"

        raise RuntimeError(error_msg)


if __name__ == "__main__":
    # CLI health check
    import json
    health = health_check()
    print(json.dumps(health, indent=2))

    if not health['healthy']:
        sys.exit(1)
