import fs from 'node:fs/promises'
import path from 'node:path'

export async function writeReport(
  outputPath: string,
  content: string,
  repoPath: string,
): Promise<string> {
  const resolved = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(repoPath, outputPath)

  await fs.mkdir(path.dirname(resolved), { recursive: true })
  await fs.writeFile(resolved, content, 'utf-8')
  return resolved
}
