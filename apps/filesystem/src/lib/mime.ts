import { open } from 'node:fs/promises';

export async function detectMimeType(absolutePath: string): Promise<string | null> {
  let handle: Awaited<ReturnType<typeof open>> | null = null;
  try {
    handle = await open(absolutePath, 'r');
    const { buffer, bytesRead } = await handle.read({
      buffer: Buffer.alloc(4100),
      position: 0,
    });
    if (bytesRead === 0) return null;
    const slice = buffer.subarray(0, bytesRead);
    const { fileTypeFromBuffer } = await import('file-type');
    const result = await fileTypeFromBuffer(slice);
    return result?.mime ?? null;
  } catch {
    return null;
  } finally {
    if (handle) {
      try {
        await handle.close();
      } catch {
        // ignore
      }
    }
  }
}
