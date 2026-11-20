#!/bin/sh
# CI entrypoint for the healthcheck service.
#
# The shared CI image keeps its Python toolchain in /opt/venv. Keep this
# script green: it is what the pipeline runs.
export PATH=/opt/venv/bin:$PATH

cd legacy_tests
exec python3 -m unittest discover -v
