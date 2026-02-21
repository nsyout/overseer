set shell := ["bash", "-cu"]

# Build Rust CLI, host, and UI
build:
    cd overseer && cargo build --release
    cd host && pnpm install && pnpm run build
    cd ui && pnpm install && pnpm run build

# Install/build Node dependencies for host and UI
setup:
    cd host && pnpm install && pnpm run build
    cd ui && pnpm install && pnpm run build

# Build release-style local runtime bundle (os + host/ui dist)
package-local:
    bash {{justfile_directory()}}/scripts/package-runtime.sh

# Install runtime bundle to ~/.local/share/overseer and ~/.local/bin/os
install-runtime VERSION="" TARBALL="":
    bash {{justfile_directory()}}/scripts/install-runtime.sh "{{VERSION}}" "{{TARBALL}}"

# Print shell exports for runtime lookup paths
runtime-env:
    @echo 'export PATH="$HOME/.local/bin:$PATH"'
    @echo 'export OVERSEER_HOST_SCRIPT="$HOME/.local/share/overseer/current/host/dist/index.js"'
    @echo 'export OVERSEER_UI_DIST="$HOME/.local/share/overseer/current/ui/dist"'

# List installed runtime versions and current pointer
list-runtime-versions:
    bash {{justfile_directory()}}/scripts/list-runtime-versions.sh

# Uninstall one runtime version (defaults to current)
uninstall-runtime VERSION="":
    bash {{justfile_directory()}}/scripts/uninstall-runtime.sh "{{VERSION}}"

# Install latest os binary from GitHub Releases (to ~/.local/bin by default)
install:
    bash {{justfile_directory()}}/scripts/install.sh

# Build from source and install os to ~/.local/bin
install-local:
    cd overseer && cargo build --release
    mkdir -p "$HOME/.local/bin"
    ln -sf {{justfile_directory()}}/overseer/target/release/os "$HOME/.local/bin/os"

# Run MCP host (update --cwd target as needed)
mcp:
    node {{justfile_directory()}}/host/dist/index.js mcp --cli-path "$HOME/.local/bin/os" --cwd {{justfile_directory()}}

# Run UI dev server
ui:
    cd ui && pnpm run dev

# Build checks for Node packages
check:
    cd host && pnpm run build
    cd ui && pnpm run build

# Prepare release bump locally (BUMP=patch|minor|major)
prepare-release BUMP="patch":
    bump="{{BUMP}}"; bump="${bump#BUMP=}"; current="$(sed -n 's/^version = "\([0-9][0-9.]*\)"$/\1/p' overseer/Cargo.toml | head -n1)"; next="$(python3 scripts/release_version.py next "$current" "$bump")"; echo "Preparing release $current -> $next"; python3 scripts/release_version.py set "$next"; cd host && pnpm install --lockfile-only; cd ../ui && pnpm install --lockfile-only; git status --short
