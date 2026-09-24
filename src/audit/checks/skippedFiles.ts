import type { ContextFile, ContextIssue } from '../../types.js'
import { MAX_TEXT_FILE_BYTES } from '../../fs/readTextFile.js'

const MAX_MIB = MAX_TEXT_FILE_BYTES / (1024 * 1024)

export function checkSkippedFile(file: ContextFile): ContextIssue[] {
  switch (file.skipped) {
    case 'outside-repo':
      return [
        {
          id: `file-access-outside-${file.path}`,
          severity: 'low',
          category: 'file-access',
          file: file.path,
          message:
            'Context file is a symbolic link that resolves outside the audited directory; it was not read',
          recommendation:
            'Audit from a directory that contains the link target, or replace the link with a regular file.',
        },
      ]
    case 'not-a-file':
      return [
        {
          id: `file-access-unreadable-${file.path}`,
          severity: 'low',
          category: 'file-access',
          file: file.path,
          message:
            'Context file is a broken symbolic link or not a regular file; agents will not see its instructions',
          recommendation: 'Fix or remove the link so the instruction file resolves to a real file.',
        },
      ]
    case 'too-large':
      return [
        {
          id: `file-size-over-limit-${file.path}`,
          severity: 'medium',
          category: 'file-size',
          file: file.path,
          message: `Context file is larger than ${MAX_MIB} MiB and was not audited`,
          recommendation:
            'Split the file into smaller, focused instruction files. Agents load these files into a limited context window.',
        },
      ]
    default:
      return []
  }
}
