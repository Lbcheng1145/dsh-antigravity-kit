import { spawn } from 'node:child_process';

import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Locate the bundled Python service: explicit env var first, then the package itself. */
function resolveBase() {
  if (process.env.ANTIGRAVITY_SDK_HOME) return process.env.ANTIGRAVITY_SDK_HOME;
  const candidates = [
    path.join(os.homedir(), 'AppData', 'Local', 'AntigravitySDK'),
    path.join(os.homedir(), '.antigravity-sdk'),
    path.resolve(import.meta.dirname, '..', '..', 'python'),
  ];
  return candidates.find((dir) => existsSync(path.join(dir, 'antigravity_dashboard_server.py'))) ?? candidates[0];
}

const BASE = resolveBase();
const PYTHONW = process.env.ANTIGRAVITY_PYTHONW ?? path.join(BASE, '.venv', 'Scripts', 'pythonw.exe');
const SERVER = path.join(BASE, 'antigravity_dashboard_server.py');

export const name = 'antigravity';

export function apply() {
  try {
    const child = spawn(PYTHONW, [SERVER], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch {
    // The page reports a clear error if the loopback service is unavailable.
  }
}
