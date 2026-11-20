"""Healthcheck implementation.

The service calls ``check_hosts`` with a batch of IP addresses and expects a
mapping of every address to a boolean.

This file is intentionally almost empty: implement it, then make the existing
test suite pass.
"""


def check_hosts(hosts, port=80, timeout=0.5):
    """Return ``{host: True}`` for hosts that accept a TCP connection.

    Parameters
    ----------
    hosts:
        Iterable of IPv4/IPv6 address strings. Duplicates collapse to one
        entry, first-seen order.
    port:
        TCP port to probe.
    timeout:
        Per-host connect timeout, in seconds.

    A host is healthy when a TCP connection to ``(host, port)`` succeeds
    within ``timeout``. Invalid addresses and invalid ports are unhealthy
    (``False``), not exceptions.
    """
    raise NotImplementedError("implement check_hosts")
