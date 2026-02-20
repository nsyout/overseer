set shell := ["bash", "-cu"]

# Build Rust CLI, host, and UI
build:
    cd overseer && cargo build --release
    cd host && npm install && npm run build
    cd ui && npm install && npm run build

# Install os binary to /usr/local/bin
install:
    mkdir -p /usr/local/bin
    ln -sf {{justfile_directory()}}/overseer/target/release/os /usr/local/bin/os

# Run MCP host (update --cwd target as needed)
mcp:
    node {{justfile_directory()}}/host/dist/index.js mcp --cli-path /usr/local/bin/os --cwd {{justfile_directory()}}

# Run UI dev server
ui:
    cd ui && npm run dev

# Build checks for Node packages
check:
    cd host && npm run build
    cd ui && npm run build
