import { execFile } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { KitchenState } from '../../src/domain/state.ts';

/** Uses the locally built policy binary. Build freshness is a release prerequisite, not inferred here. */
export async function validateStateOffline(state: KitchenState): Promise<void> {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const directory = await mkdtemp(join(tmpdir(), 'kitchen-backup-validation-'));
  try {
    const path = join(directory, 'state.json');
    await writeFile(path, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
    await promisify(execFile)(resolve(root, '../dotnet/dotnet'), [
      join(root, 'server/Tests/bin/Debug/net8.0/Kitchen.Policy.Tests.dll'), '--validate-backup-state', path,
    ], { timeout: 30000, maxBuffer: 65536 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
