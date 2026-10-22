#!/usr/bin/env python3
"""Audit installed packages, including the upstream baseline of our local fork.

The SignalR Python code is identical to upstream 1.0.2. Audit that public version
explicitly so PyPI's absence of the local packaging tag cannot skip its code.
MessagePack is audited independently at its actual installed patched version.
"""
from importlib.metadata import distributions
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

requirements = []
for package in distributions():
    name, version = package.metadata['Name'], package.version
    if name.lower() == 'signalrcore' and version == '1.0.2+f1.1':
        manifest = json.loads((Path(__file__).resolve().parents[1] / 'vendor/signalrcore/source-sha256.json').read_text())
        actual = {str(path.relative_to(package.locate_file(''))): hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in package.locate_file('signalrcore').rglob('*.py')}
        if actual != manifest:
            raise RuntimeError('SignalR source differs from the verified upstream baseline; review and audit the fork before continuing')
        version = '1.0.2'
        print('Auditing local SignalR fork code against upstream signalrcore==1.0.2; auditing installed MessagePack separately.', flush=True)
    requirements.append(f'{name}=={version}')

with TemporaryDirectory(prefix='f1-audit-') as temporary:
    inventory = Path(temporary) / 'requirements.txt'
    inventory.write_text('\n'.join(sorted(set(requirements))) + '\n')
    result = subprocess.run([sys.executable, '-m', 'pip_audit', '--no-deps', '--disable-pip',
                             '--progress-spinner', 'off', '--format', 'json', '-r', str(inventory)],
                            capture_output=True, text=True)
    if not result.stdout:
        print(result.stderr, file=sys.stderr)
        sys.exit(result.returncode or 1)
    report = json.loads(result.stdout)
    findings = [entry for entry in report['dependencies'] if entry.get('vulns') or entry.get('skip_reason')]
    print(json.dumps({'auditedPackages': len(report['dependencies']), 'findingsOrSkippedPackages': findings}))
    sys.exit(result.returncode or (1 if findings else 0))
