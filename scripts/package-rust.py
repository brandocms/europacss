#!/usr/bin/env python3
"""Build and smoke-test a native preview archive. Python is build tooling only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def command(*args):
    return subprocess.check_output(args, cwd=ROOT, text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", help="Rust target triple (default: host)")
    parser.add_argument("--out-dir", type=Path, default=ROOT / "dist/native")
    args = parser.parse_args()
    rustc = command("rustc", "-Vv")
    host = next(line.removeprefix("host: ") for line in rustc.splitlines() if line.startswith("host: "))
    target = args.target or host
    subprocess.run(["cargo", "build", "--locked", "--release", "-p", "europacss", "--target", target], cwd=ROOT, check=True)
    metadata = json.loads(command("cargo", "metadata", "--locked", "--format-version", "1", "--filter-platform", target))
    package = next(p for p in metadata["packages"] if p["name"] == "europacss")
    name = f'europa-{package["version"]}-{target}'
    binary = "europa.exe" if "windows" in target else "europa"
    source = Path(metadata["target_directory"]) / target / "release" / binary
    output = args.out_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="europa-package-") as temporary:
        stage = Path(temporary) / name
        stage.mkdir()
        shutil.copy2(source, stage / binary)
        shutil.copy2(ROOT / "LICENSE", stage / "LICENSE")
        shutil.copy2(ROOT / "crates/europacss/assets/normalize.LICENSE.md", stage / "normalize.LICENSE.md")
        shutil.copy2(ROOT / "crates/europacss/BINARY-README.md", stage / "README.md")
        shutil.copytree(ROOT / "crates/europacss/examples", stage / "examples")
        # The editor is already bundled into the binary; preserve its MIT notices.
        for editor_notice in ["editor.LICENSES.txt", "editor.dependencies.json"]:
            shutil.copy2(ROOT / "crates/europacss/studio" / editor_notice, stage / editor_notice)
        shutil.copy2(ROOT / "Cargo.lock", stage / "Cargo.lock")
        # Retain available upstream notices and a precise source/license inventory.
        # Some crate archives omit licenses that live at the repository root.
        # Versioned supplements retain those notices and their upstream sources.
        notices = stage / "licenses"
        notices.mkdir()
        dependencies = []
        for dep in sorted(metadata["packages"], key=lambda p: (p["name"], p["version"])):
            if dep["source"] is None:
                continue
            directory = Path(dep["manifest_path"]).parent
            files = [p for p in directory.iterdir() if p.is_file() and p.name.upper().startswith(("LICENSE", "LICENCE", "COPYING", "NOTICE", "UNLICENSE"))]
            if dep["license_file"]:
                license_file = directory / dep["license_file"]
                if license_file not in files:
                    files.append(license_file)
            if not files:
                supplement = ROOT / "scripts/licenses" / f'{dep["name"]}-{dep["version"]}'
                if supplement.is_dir():
                    files = sorted(p for p in supplement.iterdir() if p.is_file())
            if not files:
                raise RuntimeError(f'Missing license notices for {dep["name"]} {dep["version"]}; add a versioned supplement under scripts/licenses')
            destination = notices / f'{dep["name"]}-{dep["version"]}'
            if files:
                destination.mkdir()
                for path in files:
                    shutil.copy2(path, destination / path.name)
            dependencies.append({"name": dep["name"], "version": dep["version"], "license": dep["license"], "repository": dep["repository"], "source": dep["source"], "source_archive": f'https://static.crates.io/crates/{dep["name"]}/{dep["name"]}-{dep["version"]}.crate', "included_notices": [p.name for p in files]})
        (stage / "dependencies.json").write_text(json.dumps(dependencies, indent=2) + "\n", encoding="utf-8")
        manifest = {"version": package["version"], "target": target, "rustc": rustc.strip(), "experimental": True, "files": {}}
        for path in sorted(stage.rglob("*")):
            if path.is_file():
                manifest["files"][path.relative_to(stage).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        suffix = ".zip" if "windows" in target else ".tar.gz"
        archive = output / (name + suffix)
        # Replace only our known archive after it has been fully created.
        draft = Path(temporary) / archive.name
        if suffix == ".zip":
            with zipfile.ZipFile(draft, "w", zipfile.ZIP_DEFLATED) as handle:
                for path in sorted(stage.rglob("*")):
                    if path.is_file():
                        handle.write(path, path.relative_to(stage.parent))
        else:
            with tarfile.open(draft, "w:gz") as handle:
                handle.add(stage, arcname=name)
        if target == host:
            extracted = Path(temporary) / "extracted"
            if suffix == ".zip":
                with zipfile.ZipFile(draft) as handle:
                    handle.extractall(extracted)
            else:
                with tarfile.open(draft) as handle:
                    handle.extractall(extracted, filter="data")
            unpacked = extracted / name
            environment = {**os.environ, "PATH": "", "NO_COLOR": "1"}
            exe = str(unpacked / binary)
            version = subprocess.check_output([exe, "--version"], env=environment, text=True)
            if package["version"] not in version:
                raise RuntimeError("Packaged version does not match Cargo metadata")
            subprocess.run([exe, "examples/app.css", "--config", "examples/europa.json5", "--source-map", "-o", "example.css"], cwd=unpacked, env=environment, check=True)
            if not (unpacked / "example.css").stat().st_size or not json.loads((unpacked / "example.css.map").read_text())["sources"]:
                raise RuntimeError("Packaged compiler did not produce CSS and a source map")
            print("Packaged binary smoke test passed with an empty PATH")
        else:
            print(f"Cross-target archive built; runtime verification requires a {target} runner")
        shutil.copyfile(draft, archive)
        checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
        archive.with_name(archive.name + ".sha256").write_text(f"{checksum}  {archive.name}\n", encoding="ascii")
        print(archive)


if __name__ == "__main__":
    main()
