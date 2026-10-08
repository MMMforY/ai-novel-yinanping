"""Run inside a verified release on the server; touches only dieye-mvp."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import urllib.request

release_dir = Path(__file__).resolve().parents[1]
root = Path.home() / "apps" / "dieye-mvp"
releases = root / "releases"
if release_dir.parent.resolve() != releases.resolve() or not (release_dir / "release.json").is_file():
    raise SystemExit("Run this script only from ~/apps/dieye-mvp/releases/<release>/deploy.")
manifest = json.loads((release_dir / "release.json").read_text())
release = manifest["release"]
if release_dir.name != release or len(release) != 40 or any(c not in "0123456789abcdef" for c in release):
    raise SystemExit("Release identifier is invalid.")
for relative, expected in manifest["checksums"].items():
    file = (release_dir / relative).resolve()
    if not file.is_relative_to(release_dir) or not file.is_file():
        raise SystemExit("Invalid release file.")
    if hashlib.sha256(file.read_bytes()).hexdigest() != expected:
        raise SystemExit("Release checksum does not match: " + relative)

deploy_dir = release_dir / "deploy"
current = root / "current"
if current.exists() and not current.is_symlink():
    raise SystemExit("Unexpected current path; refusing to replace it.")
previous = current.resolve() if current.is_symlink() else None
if previous and (not previous.is_relative_to(releases) or not (previous / "deploy/compose.yaml").is_file()):
    raise SystemExit("Unexpected previous release; refusing to change it.")
env_file = deploy_dir / ".env"
if not env_file.exists():
    prior_env = previous / "deploy/.env" if previous else None
    shutil.copyfile(prior_env if prior_env and prior_env.is_file() else deploy_dir / ".env.example", env_file)
lines = [line for line in env_file.read_text().splitlines() if not line.startswith("APP_RELEASE=")]
env_file.write_text("\n".join(lines) + "\nAPP_RELEASE=" + release + "\n")
env_file.chmod(0o600)

def compose(*args, directory=deploy_dir):
    subprocess.run(["sudo", "-n", "docker", "compose", "-p", "dieye-mvp", "-f", "compose.yaml", *args],
                   cwd=directory, check=True)

owned = subprocess.check_output(
    ["sudo", "-n", "docker", "ps", "-aq", "--filter", "label=com.docker.compose.project=dieye-mvp"], text=True).strip()
port = int(next((line.split("=", 1)[1] for line in lines if line.startswith("DIEYE_PORT=")), "18787"))
if not owned:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", port))
compose("config", "--quiet")
compose("build", "api")
compose("run", "--rm", "--no-deps", "--entrypoint", "python", "api",
        "-m", "unittest", "discover", "-s", "backend/tests", "-v")
compose("up", "-d", "--wait", "--wait-timeout", "90")
with urllib.request.urlopen("http://127.0.0.1:" + str(port) + "/api/health", timeout=5) as response:
    health = json.load(response)
if health["release"] != release:
    raise SystemExit("Unexpected running release; current pointer has not changed.")
temporary = root / "current.next"
if temporary.exists() or temporary.is_symlink():
    raise SystemExit("Unexpected current.next pointer; refusing to replace it.")
temporary.symlink_to(release_dir, target_is_directory=True)
os.replace(temporary, current)
print(json.dumps({"release": release, "port": port, "mode": health["mode"], "current": str(current)}))
