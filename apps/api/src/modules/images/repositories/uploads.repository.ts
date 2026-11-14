import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Uploaded checkpoint photos all live under this sub-directory. */
export const CHECKPOINT_SUBDIR = "checkpoints";

const FILE_NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/;

/** Anything outside `<uuid>.webp` is refused before touching the filesystem. */
export function isUploadFileName(name: string): boolean {
  return FILE_NAME_PATTERN.test(name);
}

function target(rootDir: string, name: string): string {
  return path.join(rootDir, CHECKPOINT_SUBDIR, name);
}

/** Returns the generated file name. tmp + rename keeps readers from seeing partial files. */
export async function writeCheckpointImage(rootDir: string, bytes: Buffer): Promise<string> {
  const dir = path.join(rootDir, CHECKPOINT_SUBDIR);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.webp`;
  const file = target(rootDir, name);
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, bytes);
  await rename(tmp, file);
  return name;
}

export async function readCheckpointImage(rootDir: string, name: string): Promise<Buffer | null> {
  if (!isUploadFileName(name)) return null;
  try {
    return await readFile(target(rootDir, name));
  } catch {
    return null;
  }
}

export async function deleteCheckpointImage(rootDir: string, name: string): Promise<void> {
  if (!isUploadFileName(name)) return;
  await unlink(target(rootDir, name)).catch(() => undefined);
}
