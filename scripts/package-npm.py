#!/usr/bin/env python3
"""Pack native npm releases. Does not publish or download executables."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import tomllib
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def pack(stage, output):
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    result = subprocess.check_output([npm, "pack", "--ignore-scripts", "--json", "--pack-destination", str(output)], cwd=stage, text=True)
    package = json.loads(result)[0]
    archive = output / package["filename"]
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    archive.with_name(archive.name + ".sha256").write_text(f"{checksum}  {archive.name}\n", encoding="utf-8")
    print(archive)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, help="Archive created by package-rust.py, for one platform")
    parser.add_argument("--shared", action="store_true", help="Pack CLI wrapper and Vite adapter")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "dist/npm")
    args = parser.parse_args()
    if not args.archive and not args.shared:
        parser.error("supply --archive and/or --shared")
    cli = read_json(ROOT / "packages/cli/package.json")
    vite = read_json(ROOT / "packages/vite/package.json")
    cargo = tomllib.loads((ROOT / "crates/europacss/Cargo.toml").read_text())
    version = cli["version"]
    if vite["version"] != version or cargo["package"]["version"] != version or vite["dependencies"][cli["name"]] != version:
        raise ValueError("Cargo, CLI, adapter and adapter's compiler dependency must have the same exact version")
    platforms = read_json(ROOT / "packages/cli/platforms.json")
    output = args.out_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="europa-npm-") as temporary:
        temporary = Path(temporary)
        if args.shared:
            # The platform dependency map is generated only for distribution:
            # source-workspace installs must also work before the first publish.
            cli["optionalDependencies"] = {f'@brandocms/europacss-{p["suffix"]}': version for p in platforms}
            for directory, manifest in [("cli", cli), ("vite", vite)]:
                stage = temporary / directory
                shutil.copytree(ROOT / "packages" / directory, stage, ignore=shutil.ignore_patterns("node_modules", "package-lock.json", "*.tgz"))
                shutil.copy2(ROOT / "LICENSE", stage / "LICENSE")
                (stage / "package.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
                pack(stage, output)
        if args.archive:
            extracted = temporary / "native"
            if args.archive.suffix == ".zip":
                with zipfile.ZipFile(args.archive) as archive:
                    archive.extractall(extracted)
            else:
                with tarfile.open(args.archive) as archive:
                    archive.extractall(extracted, filter="data")
            native_dirs = list(extracted.iterdir())
            if len(native_dirs) != 1:
                raise ValueError("Expected one native archive directory")
            native = native_dirs[0]
            manifest = read_json(native / "manifest.json")
            if manifest["version"] != version:
                raise ValueError("Native archive and npm versions differ")
            platform = next(p for p in platforms if p["target"] == manifest["target"])
            for file, expected in manifest["files"].items():
                if hashlib.sha256((native / file).read_bytes()).hexdigest() != expected:
                    raise ValueError(f"Native archive checksum mismatch: {file}")
            missing = [p["name"] for p in read_json(native / "dependencies.json") if not p["included_notices"]]
            if missing:
                raise ValueError(f"Missing dependency notices: {', '.join(missing)}")
            stage = temporary / "platform"
            shutil.copytree(native, stage)
            binary = "europa.exe" if platform["os"] == "win32" else "europa"
            (stage / "bin").mkdir()
            shutil.move(stage / binary, stage / "bin" / binary)
            os.chmod(stage / "bin" / binary, 0o755)
            # File paths changed when the executable moved into bin/.
            manifest["files"][f"bin/{binary}"] = manifest["files"].pop(binary)
            (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
            package = {
                "name": f'@brandocms/europacss-{platform["suffix"]}', "version": version,
                "description": f'EuropaCSS executable for {platform["suffix"]}', "license": "MIT",
                "repository": cli["repository"], "os": [platform["os"]], "cpu": [platform["cpu"]],
                "exports": {"./package.json": "./package.json"},
                "publishConfig": {"access": "public", "tag": "beta"},
                **({"libc": [platform["libc"]]} if "libc" in platform else {}),
            }
            (stage / "package.json").write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
            pack(stage, output)


if __name__ == "__main__":
    main()
