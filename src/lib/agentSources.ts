// Raw sources injected into the guest on first boot. The checked-in golden
// overlay contains an older agent; the page replaces both files and restarts
// them with the FIFO-based command runner, because the wasm32 Python has no
// os.fork/subprocess.
import agentSource from "../../vm/lot-agent.py?raw";
import runnerSource from "../../vm/lot-runner.sh?raw";

export { agentSource, runnerSource };
