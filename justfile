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

# Trigger GitHub cut-release workflow (BUMP=patch|minor|major)
cut-release BUMP="patch":
    bump="{{BUMP}}"; bump="${bump#BUMP=}"; gh workflow run "Cut Release" --ref main -f bump="$bump"
