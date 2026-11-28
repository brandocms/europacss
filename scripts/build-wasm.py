#!/usr/bin/env python3
"""Build the browser compiler into packages/wasm. Python is build tooling only.

Requires the wasm32-unknown-unknown Rust target:
    rustup target add wasm32-unknown-unknown
"""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile

import rust_notices

ROOT = Path(__file__).resolve().parent.parent
TARGET = "wasm32-unknown-unknown"
PACKAGE = ROOT / "packages/wasm"


def leb128(data, offset):
    result = shift = 0
    while True:
        byte = data[offset]
        offset += 1
        result |= (byte & 0x7F) << shift
        shift += 7
        if not byte & 0x80:
            return result, offset


def imports(module):
    """Count entries in the import section; the module must run without host glue."""
    if module[:4] != b"\0asm":
        raise RuntimeError("Not a WebAssembly module")
    offset = 8
    while offset < len(module):
        section = module[offset]
        size, offset = leb128(module, offset + 1)
        if section == 2:
            return leb128(module, offset)[0]
        offset += size
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out-dir", type=Path, default=PACKAGE)
    args = parser.parse_args()
    subprocess.run(["cargo", "build", "--locked", "--profile", "wasm", "--target", TARGET, "-p", "europacss-wasm"], cwd=ROOT, check=True)
    metadata = json.loads(subprocess.check_output(["cargo", "metadata", "--locked", "--format-version", "1", "--filter-platform", TARGET], cwd=ROOT, text=True, encoding="utf-8"))
    module = (Path(metadata["target_directory"]) / TARGET / "wasm/europacss_wasm.wasm").read_bytes()
    if count := imports(module):
        raise RuntimeError(f"europacss.wasm must not import host functions; found {count}")
    output = args.out_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    (output / "europacss.wasm").write_bytes(module)
    with tempfile.TemporaryDirectory(prefix="europa-wasm-") as temporary:
        notices = Path(temporary) / "licenses"
        dependencies = rust_notices.collect(metadata, notices)
        sections = []
        for dep in dependencies:
            for name in dep["included_notices"]:
                text = (notices / f'{dep["name"]}-{dep["version"]}' / name).read_text(encoding="utf-8", errors="replace")
                sections.append(f'{dep["name"]} {dep["version"]} ({dep["license"]}) {name}\n{dep["source_archive"]}\n\n{text.strip()}\n')
        (output / "THIRD-PARTY-NOTICES.txt").write_text("\n\n".join(sections), encoding="utf-8")
    (output / "dependencies.json").write_text(json.dumps(dependencies, indent=2) + "\n", encoding="utf-8")
    print(f"{output / 'europacss.wasm'} ({len(module) / 1048576:.1f} MiB, {len(dependencies)} third-party crates)")


if __name__ == "__main__":
    main()
