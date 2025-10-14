#!/usr/bin/env bash
set -euo pipefail

URL="https://example.com"
curl --silent --fail --max-time 5 "$URL" > /dev/null
