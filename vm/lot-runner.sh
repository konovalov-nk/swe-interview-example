#!/bin/sh
# Synchronous command executor for the guest agent.
#
# The guest Python is wasm32 and has no os.fork/subprocess, so it cannot spawn
# a shell. This loop is started by the page (or by the golden image) and
# executes one line per request:
#
#   agent writes a line to /tmp/lot-cmd
#   runner executes it, writes /tmp/lot-out, /tmp/lot-exit, /tmp/lot-done
#   agent reads the result.
#
# The runner is deliberately a plain shell child of the login shell, so it can
# run Python, the venv wrapper, unittest, pkill, etc. normally.
rm -f /tmp/lot-cmd
mkfifo /tmp/lot-cmd

while true; do
  if read -r cmd < /tmp/lot-cmd; then
    sh -c "$cmd" > /tmp/lot-out 2>&1
    echo $? > /tmp/lot-exit
    : > /tmp/lot-done
  fi
done
