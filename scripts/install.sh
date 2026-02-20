#!/usr/bin/env bash
set -euo pipefail

REPO="nsyout/overseer"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
TMPDIR_CLEAN=""

cleanup() {
	if [[ -n "$TMPDIR_CLEAN" && -d "$TMPDIR_CLEAN" ]]; then
		rm -rf "$TMPDIR_CLEAN"
	fi
}

need_cmd() {
	command -v "$1" >/dev/null 2>&1 || {
		echo "Missing required command: $1" >&2
		exit 1
	}
}

sha256_file() {
	local file
	file="$1"
	if command -v sha256sum >/dev/null 2>&1; then
		sha256sum "$file" | awk '{print $1}'
	elif command -v shasum >/dev/null 2>&1; then
		shasum -a 256 "$file" | awk '{print $1}'
	else
		echo "Need sha256sum or shasum" >&2
		exit 1
	fi
}

detect_target() {
	local os arch
	os="$(uname -s | tr '[:upper:]' '[:lower:]')"
	arch="$(uname -m)"

	case "$os" in
	darwin)
		case "$arch" in
		arm64 | aarch64) echo "darwin-arm64" ;;
		*)
			echo "Unsupported macOS arch: $arch" >&2
			exit 1
			;;
		esac
		;;
	linux)
		case "$arch" in
		x86_64 | amd64) echo "linux-x64" ;;
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

download() {
	local url out
	url="$1"
	out="$2"
	local asset_name out_dir
	asset_name="$(basename "$out")"
	out_dir="$(dirname "$out")"

	if command -v curl >/dev/null 2>&1; then
		if curl -fsSL "$url" -o "$out"; then
			return 0
		fi
	elif command -v wget >/dev/null 2>&1; then
		if wget -qO "$out" "$url"; then
			return 0
		fi
	fi

	if command -v gh >/dev/null 2>&1; then
		if gh auth status >/dev/null 2>&1; then
			gh release download --repo "$REPO" --pattern "$asset_name" --dir "$out_dir" --clobber
			return 0
		fi
	fi

	cat >&2 <<EOF
Failed to download: $url

If this repository is private, authenticate GitHub CLI and retry:
  gh auth login

Or make the repository public and retry.
EOF
	exit 1
}

main() {
	need_cmd tar
	need_cmd grep
	need_cmd awk

	local target asset tarball checksums expected actual
	target="$(detect_target)"
	asset="os-${target}.tar.gz"

	TMPDIR_CLEAN="$(mktemp -d)"
	trap cleanup EXIT

	tarball="$TMPDIR_CLEAN/$asset"
	checksums="$TMPDIR_CLEAN/checksums-sha256.txt"

	download "https://github.com/${REPO}/releases/latest/download/${asset}" "$tarball"
	download "https://github.com/${REPO}/releases/latest/download/checksums-sha256.txt" "$checksums"

	expected="$(grep "  ${asset}$" "$checksums" | awk '{print $1}')"
	if [[ -z "$expected" ]]; then
		echo "Could not find checksum entry for ${asset}" >&2
		exit 1
	fi

	actual="$(sha256_file "$tarball")"
	if [[ "$actual" != "$expected" ]]; then
		echo "Checksum mismatch for ${asset}" >&2
		echo "Expected: $expected" >&2
		echo "Actual:   $actual" >&2
		exit 1
	fi

	tar -xzf "$tarball" -C "$TMPDIR_CLEAN"
	mkdir -p "$INSTALL_DIR"
	install -m 755 "$TMPDIR_CLEAN/os" "$INSTALL_DIR/os"

	echo "Installed os to $INSTALL_DIR/os"
	echo "Add to PATH if needed: export PATH=\"$INSTALL_DIR:\$PATH\""
}

main "$@"
