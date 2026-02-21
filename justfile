set shell := ["bash", "-cu"]

# Build Rust CLI, host, and UI
build:
    cd overseer && cargo build --release
    cd host && pnpm install && pnpm run build
    cd ui && pnpm install && pnpm run build

# Install/build Node dependencies for host and UI
setup:
    cd host && pnpm install && pnpm run build
    cd ui && pnpm install

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
