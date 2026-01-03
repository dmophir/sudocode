# npm Install Profiling Script

This directory contains a profiling script for benchmarking `npm install -g sudocode` and capturing detailed timing metrics.

## Usage

### Basic Usage

```bash
node scripts/profiling/benchmark.cjs
```

This will:
1. Run `npm install -g sudocode --timing`
2. Capture total installation time
3. Parse npm's timing logs to extract phase-level metrics
4. Save results to `scripts/profiling/results/benchmark-{scenario}-{timestamp}.json`

### Scenario-Based Benchmarking

Use the `SCENARIO` environment variable to differentiate between test conditions:

```bash
# Fresh install scenario
SCENARIO=fresh-install node scripts/profiling/benchmark.cjs

# Development environment scenario
SCENARIO=dev-environment node scripts/profiling/benchmark.cjs
```

Common scenarios:
- `fresh-install` - Clean system, no cache
- `dev-environment` - Typical developer machine with existing npm cache

## Output Format

The script generates JSON files with the following structure:

```json
{
  "timestamp": "2026-01-02T10:30:00Z",
  "scenario": "fresh-install",
  "environment": {
    "os": "darwin",
    "nodeVersion": "v20.10.0",
    "npmVersion": "10.2.3",
    "macosVersion": "14.0"
  },
  "timing": {
    "total": 45230,
    "phases": {
      "idealTree": 2100,
      "reifyNode": 18500,
      "build": 22400,
      "preinstall": 150,
      "postinstall": 850,
      "finalTree": 800
    }
  }
}
```

### Field Descriptions

**Environment Metadata:**
- `timestamp` - ISO 8601 timestamp of when the benchmark was run
- `scenario` - User-specified scenario type (default: "fresh-install")
- `environment.os` - Operating system platform (e.g., "darwin", "linux", "win32")
- `environment.nodeVersion` - Node.js version (e.g., "v20.10.0")
- `environment.npmVersion` - npm version (e.g., "10.2.3")
- `environment.macosVersion` - macOS version if applicable (e.g., "14.0")

**Timing Data (all values in milliseconds):**
- `timing.total` - Total installation time measured by the script
- `timing.phases.idealTree` - Time spent resolving the dependency tree
- `timing.phases.reifyNode` - Time spent downloading and extracting packages
- `timing.phases.build` - Time spent building native modules
- `timing.phases.preinstall` - Time spent running preinstall scripts
- `timing.phases.postinstall` - Time spent running postinstall scripts
- `timing.phases.finalTree` - Time spent finalizing the installation

## Requirements

- Node.js (any version compatible with npm)
- npm CLI installed
- macOS (for `macosVersion` field; script works on other platforms but won't capture macOS version)

## Implementation Details

The script uses only Node.js standard library modules:
- `child_process` - For running npm commands
- `fs` - For file operations
- `path` - For path manipulation
- `os` - For system information

No external dependencies are required.

## GitHub Actions Integration

This script is designed to run in GitHub Actions workflows:

```yaml
- name: Run install benchmark
  run: |
    SCENARIO=fresh-install node scripts/profiling/benchmark.cjs
  
- name: Upload benchmark results
  uses: actions/upload-artifact@v3
  with:
    name: benchmark-results
    path: scripts/profiling/results/*.json
```

## Results Directory

Benchmark results are saved to `scripts/profiling/results/` with filenames in the format:

```
benchmark-{scenario}-{timestamp}.json
```

Example: `benchmark-fresh-install-1735819800000.json`

The results directory is gitignored to prevent committing benchmark artifacts to the repository.

## Troubleshooting

### No timing logs found

If the script fails to find npm timing logs, ensure that:
1. npm install actually ran successfully
2. The `~/.npm/_logs/` directory exists
3. npm created timing logs (requires npm 5.1.0+)

The script will continue and provide total time even if timing logs are unavailable.

### Permission errors

If you encounter permission errors during `npm install -g`, you may need to:
1. Run with sudo (not recommended)
2. Configure npm to use a different global prefix
3. Use a Node version manager like nvm

## Module Exports

The script exports the following functions for programmatic use:

```javascript
const { runBenchmark, parseTimingLog, getMacOSVersion, getVersions } = require('./benchmark.cjs');

// Run a complete benchmark
const result = runBenchmark();

// Parse a specific timing log file
const phases = parseTimingLog('/path/to/timing.json');

// Get macOS version (returns null on other platforms)
const macosVersion = getMacOSVersion();

// Get Node.js and npm versions
const { nodeVersion, npmVersion } = getVersions();
```
