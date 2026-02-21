#!/usr/bin/env bash
set -euo pipefail

INSTALL_BASE="${OVERSEER_RUNTIME_BASE:-$HOME/.local/share/overseer}"
VERSIONS_DIR="$INSTALL_BASE/versions"
CURRENT_LINK="$INSTALL_BASE/current"
BIN_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
BIN_LINK="$BIN_DIR/os"

version_arg="${1:-}"

if [[ ! -d "$VERSIONS_DIR" ]]; then
	echo "No runtime versions installed (missing $VERSIONS_DIR)."
	exit 0
fi

current_version=""
if [[ -L "$CURRENT_LINK" ]]; then
	current_target="$(readlink "$CURRENT_LINK")"
	current_version="${current_target##*/}"
fi

if [[ -z "$version_arg" ]]; then
	if [[ -z "$current_version" ]]; then
		echo "No current runtime set. Pass VERSION explicitly." >&2
		exit 1
	fi
	target_version="$current_version"
else
	target_version="$version_arg"
fi

target_dir="$VERSIONS_DIR/$target_version"
if [[ ! -d "$target_dir" ]]; then
	echo "Runtime version not found: $target_version" >&2
	exit 1
fi

is_current=0
if [[ "$target_version" == "$current_version" ]]; then
	is_current=1
fi

rm -rf "$target_dir"
echo "Removed runtime version: $target_version"

if [[ "$is_current" -eq 1 ]]; then
	replacement=""
	for dir in "$VERSIONS_DIR"/*; do
		if [[ -d "$dir" ]]; then
			replacement="$(basename "$dir")"
			break
		fi
	done

	if [[ -n "$replacement" ]]; then
		ln -sfn "$VERSIONS_DIR/$replacement" "$CURRENT_LINK"
		ln -sfn "$CURRENT_LINK/os" "$BIN_LINK"
		echo "Current runtime now: $replacement"
	else
		rm -f "$CURRENT_LINK"
		if [[ -L "$BIN_LINK" ]]; then
			bin_target="$(readlink "$BIN_LINK")"
			if [[ "$bin_target" == *"/overseer/current/os" ]]; then
				rm -f "$BIN_LINK"
			fi
		fi
		echo "No runtime versions remain; cleared current pointer."
	fi
fi
