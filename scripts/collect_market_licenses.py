"""Collect redistribution notices without including runtime/user data."""
import importlib.metadata
import shutil
import sys
from pathlib import Path

project = Path(__file__).resolve().parent.parent
destination = Path(sys.argv[1]) / 'licenses'
destination.mkdir(parents=True, exist_ok=True)
for distribution in importlib.metadata.distributions():
    for file in distribution.files or []:
        if 'dist-info' in str(file) and file.name.lower().startswith(('license', 'copying', 'notice')):
            source = Path(distribution.locate_file(file))
            if source.is_file():
                shutil.copyfile(source, destination / (distribution.metadata.get('Name', 'package') + '-' + file.name))
for source in (project / 'frontend' / 'node_modules').rglob('*'):
    if source.is_file() and source.name.upper().startswith(('LICENSE', 'NOTICE', 'COPYING')):
        relative = str(source.relative_to(project / 'frontend' / 'node_modules')).replace('\\', '_').replace('/', '_')
        shutil.copyfile(source, destination / relative)
python_license = Path(sys.base_prefix) / 'LICENSE.txt'
if python_license.exists():
    shutil.copyfile(python_license, destination / 'CPython-LICENSE.txt')
print(f'License notices: {len(list(destination.iterdir()))}')
