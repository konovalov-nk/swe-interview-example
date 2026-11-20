# Healthcheck service

The on-call dashboard needs a small helper that probes a batch of hosts over
TCP and reports which ones are reachable. `solution.py` currently contains only
the signature. Implement it.

## The contract

```python
def check_hosts(hosts, port=80, timeout=0.5) -> dict[str, bool]:
    ...
```

- `hosts` is an iterable of IPv4/IPv6 address strings.
- Return one entry per unique host: `True` if a TCP connection to
  `(host, port)` succeeds within `timeout`, otherwise `False`.
- Duplicates collapse to one entry; keep first-seen order.
- An empty input returns `{}`.
- Invalid addresses and invalid ports are `False`, never an exception.
- Probes must run concurrently: a batch of unreachable hosts should take
  roughly one timeout, not one timeout per host.
- Close every socket. Do not change the process-wide default socket timeout.
- Standard library only. No `ping`, no subprocesses, no external services.

## Workspace

```
/root/work/
  solution.py
  run_tests.sh
  tests/                 <- acceptance suite
  legacy_tests/          <- older smoke checks
```

The CI entrypoint is:

```sh
cd /root/work
./run_tests.sh
```

## Definition of done

`./run_tests.sh` passes the acceptance suite, and `solution.py` implements the
contract above. The tests are the specification; do not weaken assertions to
make a broken implementation pass.
