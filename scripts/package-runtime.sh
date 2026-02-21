#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

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

main() {
	need_cmd cargo
	need_cmd pnpm
	need_cmd tar
	need_cmd awk

	local version target dist_dir staging_root bundle_root out
	version="$(awk -F '"' '/^version = "/ { print $2; exit }' "$REPO_ROOT/overseer/Cargo.toml")"
	target="$(detect_target)"

	if [[ -z "$version" ]]; then
		echo "Could not determine version from overseer/Cargo.toml" >&2
		exit 1
	fi

	dist_dir="$REPO_ROOT/dist"
	staging_root="$dist_dir/.runtime-staging"
	bundle_root="$staging_root/overseer-runtime"
	out="$dist_dir/overseer-runtime-${version}-${target}.tar.gz"

	rm -rf "$staging_root"
	mkdir -p "$bundle_root/host" "$bundle_root/ui" "$dist_dir"

	echo "Building os binary..."
	(
		cd "$REPO_ROOT/overseer"
		cargo build --release
	)

	echo "Building host..."
	(
		cd "$REPO_ROOT/host"
		pnpm install
		pnpm run build
	)

	echo "Building ui..."
	(
		cd "$REPO_ROOT/ui"
		pnpm install
		pnpm run build
	)

	cp "$REPO_ROOT/overseer/target/release/os" "$bundle_root/os"
	cp -R "$REPO_ROOT/host/dist" "$bundle_root/host/dist"
	cp -R "$REPO_ROOT/ui/dist" "$bundle_root/ui/dist"
	printf '%s\n' "$version" >"$bundle_root/VERSION"
	printf '%s\n' "$target" >"$bundle_root/TARGET"

	tar -C "$staging_root" -czf "$out" overseer-runtime
	rm -rf "$staging_root"

	echo "Created runtime bundle: $out"
}

main "$@"
