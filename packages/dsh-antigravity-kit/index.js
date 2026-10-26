import { spawn } from 'node:child_process';

import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Locate the bundled Python service: explicit env var first, then the package itself. */
function resolveBase() {
  if (process.env.ANTIGRAVITY_SDK_HOME) return process.env.ANTIGRAVITY_SDK_HOME;
  const candidates = [
    // Bundled inside this package, so a fresh install works without extra setup.
    path.resolve(import.meta.dirname, 'python'),
    path.join(os.homedir(), 'AppData', 'Local', 'AntigravitySDK'),
    path.join(os.homedir(), '.antigravity-sdk'),
    path.resolve(import.meta.dirname, '..', '..', 'python'),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, 'antigravity_dashboard_server.py'))) ?? candidates[0];
}

const BASE = resolveBase();
const SERVER = path.join(BASE, 'antigravity_dashboard_server.py');

/** Resolve the interpreter: explicit override, project venv, then the system launcher. */
function resolveInterpreter() {
  if (process.env.ANTIGRAVITY_PYTHONW) return process.env.ANTIGRAVITY_PYTHONW;
  const venv = path.join(BASE, '.venv', 'Scripts', 'pythonw.exe');
  if (existsSync(venv)) return venv;
  const local = path.join(BASE, '.venv', 'Scripts', 'python.exe');
  if (existsSync(local)) return local;
  return 'pythonw.exe';
}

export const name = 'antigravity';

export function apply(ctx) {
  if (!existsSync(SERVER)) {
    ctx?.logger?.warn?.(
      'antigravity: dashboard service not found at ' + SERVER +
      '; set ANTIGRAVITY_SDK_HOME to the directory holding antigravity_dashboard_server.py',
    );
    return;
  }
  try {
    const child = spawn(resolveInterpreter(), [SERVER], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', () => {
      // A missing interpreter is reported by the page as an unreachable service.
    });
    child.unref();
  } catch {
    // The page reports a clear error if the loopback service is unavailable.
  }
}
