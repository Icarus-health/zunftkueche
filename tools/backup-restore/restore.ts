import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validateStateOffline } from './validator.ts';
import { validateKitchenBackup } from '../../src/data/backup.ts';
import type { KitchenBackup } from '../../src/data/backup.ts';

/** Local evidence only. No production imports or Microsoft writes. Directory must not exist. */
export async function restoreLocalTest(backup: KitchenBackup, target: {
  kind: 'isolated-local-test'; directory: string; authorized: boolean;
}) {
  if (target.kind !== 'isolated-local-test' || target.authorized !== true)
    throw new Error('Separate autorisierte Testumgebung erforderlich.');
  const directory = resolve(target.directory);
  if (directory.split('/').some(part => part === '.local-state' || part === '.git') || directory === process.cwd())
    throw new Error('Produktivbestand ist kein Testziel.');
  if ((await validateKitchenBackup(backup, validateStateOffline)).complete !== true)
    throw new Error('Unvollständige Sicherung: keine vollständige Wiederherstellung.');
  if (backup.documentManifest.some(original => original.bytesBase64 === undefined))
    throw new Error('Getrennt gesicherte Originale müssen vor der Wiederherstellung gelesen und als geprüfte Bytes bereitgestellt werden.');

  await mkdir(directory, { recursive: false, mode: 0o700 });
  await writeFile(join(directory, 'backup.json'), JSON.stringify(backup), { flag: 'wx', mode: 0o600 });
  for (const [index, original] of backup.documentManifest.entries()) {
    await writeFile(join(directory, `original-${index}.bin`), Buffer.from(original.bytesBase64!, 'base64'), { flag: 'wx', mode: 0o600 });
  }
  for (const [index, original] of backup.documentManifest.entries()) {
    const restored = await readFile(join(directory, `original-${index}.bin`));
    if (!Buffer.from(original.bytesBase64!, 'base64').equals(restored)) throw new Error('Original-Readback weicht ab.');
  }
  const readback = JSON.parse(await readFile(join(directory, 'backup.json'), 'utf8'));
  await validateKitchenBackup(readback, validateStateOffline);
  return {
    status: 'local-isolated-restore-verified', directory,
    sourceContract: backup.sourceContract?.id ?? 'legacy-full-contract', microsoftRestore: 'not-tested',
  };
}
