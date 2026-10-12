#!/bin/bash
# Bash 3.2 launcher; JSON and NUL-delimited paths are parsed by Python 3.
set -e
exec python3 "$(dirname "$0")/owners.py" "$@"
