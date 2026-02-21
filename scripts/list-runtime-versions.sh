#!/usr/bin/env bash
set -euo pipefail

INSTALL_BASE="${OVERSEER_RUNTIME_BASE:-$HOME/.local/share/overseer}"
VERSIONS_DIR="$INSTALL_BASE/versions"
CURRENT_LINK="$INSTALL_BASE/current"

if [[ ! -d "$VERSIONS_DIR" ]]; then
	echo "No runtime versions installed (missing $VERSIONS_DIR)."
	exit 0
fi

current_target=""
if [[ -L "$CURRENT_LINK" ]]; then
	current_target="$(readlink "$CURRENT_LINK")"
	current_target="${current_target##*/}"
fi

echo "Runtime base: $INSTALL_BASE"
echo "Installed versions:"

found=0
for dir in "$VERSIONS_DIR"/*; do
	if [[ -d "$dir" ]]; then
		found=1
		version="$(basename "$dir")"
		marker=" "
		if [[ "$version" == "$current_target" ]]; then
			marker="*"
		fi
		echo "  $marker $version"
	fi
done

if [[ "$found" -eq 0 ]]; then
	echo "  (none)"
fi

if [[ -n "$current_target" ]]; then
	echo
	echo "Current: $current_target"
else
	echo
	echo "Current: (not set)"
fi
