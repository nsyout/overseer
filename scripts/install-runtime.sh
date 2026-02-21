#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

INSTALL_BASE="${OVERSEER_RUNTIME_BASE:-$HOME/.local/share/overseer}"
VERSIONS_DIR="$INSTALL_BASE/versions"
CURRENT_LINK="$INSTALL_BASE/current"
BIN_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
BIN_LINK="$BIN_DIR/os"
TMP_DIR=""

cleanup() {
	if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
		rm -rf "$TMP_DIR"
	fi
}

need_cmd() {
	command -v "$1" >/dev/null 2>&1 || {
		echo "Missing required command: $1" >&2
		exit 1
	}
}

detect_target() {
	local os arch
	os="$(uname -s | tr '[:upper:]' '[:lower:]')"
	arch="$(uname -m)"

	case "$os" in
	darwin)
		case "$arch" in
		arm64 | aarch64) echo "darwin-arm64" ;;
		x86_64 | amd64) echo "darwin-x64" ;;
		*)
			echo "Unsupported macOS arch: $arch" >&2
			exit 1
			;;
		esac
		;;
	linux)
		case "$arch" in
		x86_64 | amd64) echo "linux-x64" ;;
		aarch64 | arm64) echo "linux-arm64" ;;
		*)
			echo "Unsupported Linux arch: $arch" >&2
			exit 1
			;;
		esac
		;;
	*)
		echo "Unsupported OS: $os" >&2
		exit 1
		;;
	esac
}

latest_bundle_for_target() {
	local target
	target="$1"
	local latest
	latest="$(ls -1t "$REPO_ROOT"/dist/overseer-runtime-*-${target}.tar.gz 2>/dev/null | head -n1 || true)"
	printf '%s\n' "$latest"
}

main() {
	need_cmd tar
	need_cmd awk
	need_cmd mktemp

	local version_arg tarball_arg target tarball extracted_root bundle_version install_dir
	version_arg="${1:-}"
	tarball_arg="${2:-}"
	target="$(detect_target)"

	if [[ -n "$tarball_arg" ]]; then
		tarball="$tarball_arg"
	elif [[ -n "$version_arg" ]]; then
		tarball="$REPO_ROOT/dist/overseer-runtime-${version_arg}-${target}.tar.gz"
	else
		tarball="$(latest_bundle_for_target "$target")"
	fi

	if [[ -z "$tarball" || ! -f "$tarball" ]]; then
		echo "Runtime bundle not found." >&2
		echo "Expected one of:" >&2
		echo "  - explicit tarball path" >&2
		echo "  - $REPO_ROOT/dist/overseer-runtime-<version>-${target}.tar.gz" >&2
		echo "Run: just package-local" >&2
		exit 1
	fi

	TMP_DIR="$(mktemp -d)"
	trap cleanup EXIT

	tar -xzf "$tarball" -C "$TMP_DIR"
	extracted_root="$TMP_DIR/overseer-runtime"

	if [[ ! -f "$extracted_root/os" ]]; then
		echo "Invalid bundle: missing os binary" >&2
		exit 1
	fi
	if [[ ! -f "$extracted_root/host/dist/index.js" ]]; then
		echo "Invalid bundle: missing host/dist/index.js" >&2
		exit 1
	fi
	if [[ ! -f "$extracted_root/ui/dist/index.html" ]]; then
		echo "Invalid bundle: missing ui/dist/index.html" >&2
		exit 1
	fi

	bundle_version="$(awk 'NR==1{print; exit}' "$extracted_root/VERSION")"
	if [[ -z "$bundle_version" ]]; then
		echo "Invalid bundle: missing VERSION metadata" >&2
		exit 1
	fi

	install_dir="$VERSIONS_DIR/$bundle_version"

	mkdir -p "$VERSIONS_DIR" "$BIN_DIR"
	rm -rf "$install_dir"
	cp -R "$extracted_root" "$install_dir"
	chmod 755 "$install_dir/os"

	ln -sfn "$install_dir" "$CURRENT_LINK"
	ln -sfn "$CURRENT_LINK/os" "$BIN_LINK"

	echo "Installed Overseer runtime version $bundle_version"
	echo "  Runtime: $install_dir"
	echo "  Current: $CURRENT_LINK"
	echo "  Binary : $BIN_LINK"
	echo
	echo "Add these to your shell profile (if not already set):"
	echo 'export PATH="$HOME/.local/bin:$PATH"'
	echo 'export OVERSEER_HOST_SCRIPT="$HOME/.local/share/overseer/current/host/dist/index.js"'
	echo 'export OVERSEER_UI_DIST="$HOME/.local/share/overseer/current/ui/dist"'
}

main "$@"
