set shell := ["bash", "-cu"]

# Build Rust CLI, host, and UI
build:
    cd overseer && cargo build --release
    cd host && npm install && npm run build
    cd ui && npm install && npm run build

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
    cd ui && npm run dev

# Build checks for Node packages
check:
    cd host && npm run build
    cd ui && npm run build
