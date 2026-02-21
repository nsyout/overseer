#!/usr/bin/env python3
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent


def parse_version(version: str) -> tuple[int, int, int]:
    m = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
    if not m:
        raise ValueError(f"Invalid semver: {version}")
    return int(m.group(1)), int(m.group(2)), int(m.group(3))


def next_version(current: str, bump: str) -> str:
    major, minor, patch = parse_version(current)
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    if bump == "patch":
        return f"{major}.{minor}.{patch + 1}"
    raise ValueError(f"Invalid bump type: {bump}")


def replace_in_file(path: Path, pattern: str, repl: str) -> None:
    text = path.read_text(encoding="utf-8")
    new_text, n = re.subn(pattern, repl, text, count=1, flags=re.MULTILINE)
    if n != 1:
        raise RuntimeError(f"Failed to update version in {path}")
    path.write_text(new_text, encoding="utf-8")


def set_version(version: str) -> None:
    parse_version(version)

    replace_in_file(
        ROOT / "overseer" / "Cargo.toml",
        r'^version = "[0-9]+\.[0-9]+\.[0-9]+"$',
        f'version = "{version}"',
    )
    replace_in_file(
        ROOT / "host" / "package.json",
        r'^  "version": "[0-9]+\.[0-9]+\.[0-9]+",$',
        f'  "version": "{version}",',
    )
    replace_in_file(
        ROOT / "ui" / "package.json",
        r'^  "version": "[0-9]+\.[0-9]+\.[0-9]+",$',
        f'  "version": "{version}",',
    )


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: release_version.py <next|set> ...", file=sys.stderr)
        return 1

    cmd = sys.argv[1]
    try:
        if cmd == "next":
            if len(sys.argv) != 4:
                print(
                    "Usage: release_version.py next <current> <patch|minor|major>",
                    file=sys.stderr,
                )
                return 1
            print(next_version(sys.argv[2], sys.argv[3]))
            return 0

        if cmd == "set":
            if len(sys.argv) != 3:
                print("Usage: release_version.py set <version>", file=sys.stderr)
                return 1
            set_version(sys.argv[2])
            return 0

        print(f"Unknown command: {cmd}", file=sys.stderr)
        return 1
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
