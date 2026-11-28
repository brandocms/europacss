"""Collect upstream license notices for third-party crates. Build tooling only."""
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent.parent


def collect(metadata, notices):
    """Copy each registry crate's notices under `notices` and return the inventory.

    Some crate archives omit licenses that live at the repository root.
    Versioned supplements under scripts/licenses retain those notices.
    """
    notices.mkdir(parents=True, exist_ok=True)
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
        destination.mkdir()
        for path in files:
            shutil.copy2(path, destination / path.name)
        dependencies.append({"name": dep["name"], "version": dep["version"], "license": dep["license"], "repository": dep["repository"], "source": dep["source"], "source_archive": f'https://static.crates.io/crates/{dep["name"]}/{dep["name"]}-{dep["version"]}.crate', "included_notices": [p.name for p in files]})
    return dependencies
