#!/usr/bin/env bash
set -euo pipefail

node "$(dirname "$0")/refresh_api_docs.mjs"
