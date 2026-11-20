"""Acceptance tests for solution.check_hosts.

Run from this directory:

    python3 -m unittest -v test_solution
"""

import concurrent.futures
import os
import sys
import socket
import threading
import time
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
import solution

HOST = "127.0.0.1"
DOWN_PORT = 18080


class TcpServer:
    """A tiny listener that accepts and immediately closes connections."""

    def __init__(self, host, family=socket.AF_INET):
        self.sock = socket.socket(family, socket.SOCK_STREAM)
        self.sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.sock.bind((host, 0))
        self.sock.listen(64)
        self.port = self.sock.getsockname()[1]
        self._stop = False
        self._thread = threading.Thread(target=self._serve, daemon=True)
        self._thread.start()

    def _serve(self):
        while not self._stop:
            try:
                conn, _ = self.sock.accept()
            except OSError:
                break
            try:
                conn.close()
            except OSError:
                pass

    def close(self):
        self._stop = True
        try:
            self.sock.close()
        except OSError:
            pass


SERVER = None
SERVER6 = None


def setUpModule():
    global SERVER, SERVER6
    SERVER = TcpServer(HOST)
    try:
        SERVER6 = TcpServer("::1", socket.AF_INET6)
    except OSError:
        SERVER6 = None


def tearDownModule():
    if SERVER:
        SERVER.close()
    if SERVER6:
        SERVER6.close()


class HealthcheckTest(unittest.TestCase):
    def test_single_reachable(self):
        self.assertEqual(solution.check_hosts([HOST], SERVER.port, timeout=0.5), {HOST: True})

    def test_single_unreachable(self):
        self.assertEqual(solution.check_hosts([HOST], DOWN_PORT, timeout=0.2), {HOST: False})

    def test_mixed(self):
        hosts = [HOST, "127.0.0.2", "127.0.0.3"]
        result = solution.check_hosts(hosts, SERVER.port, timeout=0.2)
        self.assertEqual(result, {HOST: True, "127.0.0.2": False, "127.0.0.3": False})

    def test_empty(self):
        self.assertEqual(solution.check_hosts([], SERVER.port), {})

    def test_duplicates(self):
        result = solution.check_hosts([HOST, HOST, HOST], SERVER.port)
        self.assertEqual(result, {HOST: True})

    def test_order(self):
        hosts = ["127.0.0.3", HOST, "127.0.0.2"]
        self.assertEqual(list(solution.check_hosts(hosts, SERVER.port).keys()), hosts)

    def test_invalid_ip(self):
        hosts = ["999.999.999.999", "not-an-ip", ""]
        result = solution.check_hosts(hosts, SERVER.port, timeout=0.2)
        self.assertEqual(result, {h: False for h in hosts})

    def test_invalid_port_high(self):
        self.assertEqual(solution.check_hosts([HOST], 70000, timeout=0.2), {HOST: False})

    def test_invalid_port_negative(self):
        self.assertEqual(solution.check_hosts([HOST], -1, timeout=0.2), {HOST: False})

    def test_ipv6_reachable(self):
        if SERVER6 is None:
            self.skipTest("IPv6 loopback unavailable")
        self.assertEqual(solution.check_hosts(["::1"], SERVER6.port, timeout=0.5), {"::1": True})

    def test_ipv6_unreachable(self):
        if SERVER6 is None:
            self.skipTest("IPv6 loopback unavailable")
        self.assertEqual(solution.check_hosts(["::1"], DOWN_PORT, timeout=0.2), {"::1": False})

    def test_ipv4_mapped(self):
        mapped = "::ffff:127.0.0.1"
        try:
            probe = socket.create_connection((mapped, SERVER.port), timeout=0.5)
            probe.close()
        except OSError:
            self.skipTest("IPv4-mapped IPv6 is not available")
        self.assertEqual(solution.check_hosts([mapped], SERVER.port, timeout=0.5), {mapped: True})

    def test_many_hosts(self):
        hosts = ["127.0.0.%d" % i for i in range(1, 21)]
        result = solution.check_hosts(hosts, SERVER.port, timeout=0.2)
        self.assertEqual(set(result), set(hosts))
        self.assertTrue(result[HOST])
        self.assertFalse(any(result[h] for h in hosts[1:]))

    def test_timeout_value(self):
        real = socket.socket.settimeout
        seen = []

        def spy(self, value):
            seen.append(value)
            return real(self, value)

        with mock.patch.object(socket.socket, "settimeout", spy):
            solution.check_hosts([HOST], SERVER.port, timeout=0.25)
        self.assertIn(0.25, seen)

    def test_concurrent(self):
        hosts = ["127.0.0.%d" % i for i in range(2, 10)]

        def slow_connect(self, address):
            time.sleep(0.2)
            raise ConnectionRefusedError(111, "refused")

        with mock.patch.object(socket.socket, "connect", slow_connect):
            started = time.monotonic()
            result = solution.check_hosts(hosts, 9, timeout=0.2)
            elapsed = time.monotonic() - started

        self.assertEqual(result, {h: False for h in hosts})
        self.assertLess(elapsed, 1.2, "probes look serial; run them concurrently")

    def test_no_fd_leak(self):
        def fd_count():
            return len(os.listdir("/proc/self/fd"))

        before = fd_count()
        for _ in range(30):
            solution.check_hosts([HOST], SERVER.port, timeout=0.5)
        after = fd_count()
        self.assertLessEqual(after - before, 4, "sockets are not being closed")

    def test_returns_dict(self):
        self.assertIsInstance(solution.check_hosts([HOST], SERVER.port), dict)

    def test_all_keys(self):
        hosts = [HOST, "127.0.0.2", "127.0.0.3"]
        self.assertEqual(set(solution.check_hosts(hosts, SERVER.port)), set(hosts))

    def test_global_timeout(self):
        before = socket.getdefaulttimeout()
        solution.check_hosts([HOST], SERVER.port, timeout=0.2)
        self.assertEqual(socket.getdefaulttimeout(), before)

    def test_thread_safe(self):
        def batch(_):
            return solution.check_hosts([HOST], SERVER.port, timeout=0.5)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            results = list(pool.map(batch, range(4)))
        self.assertEqual(results, [{HOST: True}] * 4)


if __name__ == "__main__":
    unittest.main()
