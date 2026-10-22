# SignalR dependency security maintenance

This is the unmodified Python source and MIT license from the PyPI
`signalrcore==1.0.2` source distribution. The project maintains its packaging as
`1.0.2+f1.1`, replacing the upstream `msgpack==1.1.2` dependency with
`msgpack>=1.2.3,<2`. This is a local maintenance fork, not an upstream release.
No package code is changed. FastF1's HTTP timing/calendar functionality and
SignalR's MessagePack protocol are tested with the updated dependency.

Source: https://pypi.org/project/signalrcore/1.0.2/
Archive SHA-256: `8d3bdcb6c66de58894d0dce43f16d2cd95188cd426342b82d5d52c72b8856927`
Upstream: https://github.com/mandrewcito/signalrcore

Install from the repository root with `pip install -r requirements.txt` or
`pip install -r etl/requirements.txt`. Remove this fork once upstream supports
a patched MessagePack release; rerun the protocol, FastF1, dependency, and
pipeline checks before switching back. Vulnerability scans still inspect both
the SignalR package and the installed MessagePack package; no IDs are ignored.
