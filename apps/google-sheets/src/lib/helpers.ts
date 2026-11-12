import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Save buffer to downloads folder.
 */
export async function saveToDownloads(
  buffer: Buffer,
  fileName: string,
  customPath?: string,
): Promise<string> {
  const outputPath = customPath || join(process.env.HOME || '/tmp', 'Downloads', fileName);

  // Ensure directory exists
  const dir = outputPath.substring(0, outputPath.lastIndexOf('/'));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  writeFileSync(outputPath, buffer);
  return outputPath;
}
