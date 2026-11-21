"""Create a standard DEFLATE ZIP without redundant directory records."""
from pathlib import Path
import sys
import zipfile

workspace = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]).resolve()
destination = Path(sys.argv[2]).resolve()
if source.parent != workspace or destination.parent != workspace:
    raise RuntimeError("Package paths must stay inside Map It")
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for file in sorted(source.rglob("*")):
        if file.is_symlink():
            raise RuntimeError("Package inputs must not contain links")
        if file.is_file():
            archive.write(file, file.relative_to(source).as_posix())
with zipfile.ZipFile(destination) as archive:
    if archive.testzip() is not None:
        raise RuntimeError("Package CRC verification failed")
