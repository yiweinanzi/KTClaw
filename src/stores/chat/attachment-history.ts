export interface LocalAttachmentMeta {
  fileName: string;
  mimeType: string;
  fileSize: number;
  preview: string | null;
  filePath?: string;
}

export interface MessageWithLocalAttachments {
  role?: string;
  id?: string;
  timestamp?: number;
  _attachedFiles?: LocalAttachmentMeta[];
}

const USER_ATTACHMENT_MATCH_WINDOW_MS = 5_000;

function timestampToMs(timestamp: number | undefined): number | null {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return null;
  }
  return timestamp < 1e12 ? timestamp * 1000 : timestamp;
}

function attachmentKey(file: LocalAttachmentMeta): string {
  return file.filePath || `${file.fileName}\0${file.mimeType}\0${file.fileSize}`;
}

function cloneAttachment(file: LocalAttachmentMeta): LocalAttachmentMeta {
  return { ...file };
}

function mergeAttachmentLists(
  historyFiles: LocalAttachmentMeta[] | undefined,
  localFiles: LocalAttachmentMeta[],
): { files: LocalAttachmentMeta[]; changed: boolean } {
  const merged = (historyFiles ?? []).map(cloneAttachment);
  const byKey = new Map<string, number>();
  merged.forEach((file, index) => {
    byKey.set(attachmentKey(file), index);
  });

  let changed = false;
  for (const localFile of localFiles) {
    const key = attachmentKey(localFile);
    const existingIndex = byKey.get(key);
    if (existingIndex == null) {
      byKey.set(key, merged.length);
      merged.push(cloneAttachment(localFile));
      changed = true;
      continue;
    }

    const existing = merged[existingIndex];
    const next = {
      ...existing,
      fileName: existing.fileName || localFile.fileName,
      mimeType: existing.mimeType || localFile.mimeType,
      fileSize: existing.fileSize || localFile.fileSize,
      preview: existing.preview || localFile.preview,
      filePath: existing.filePath || localFile.filePath,
    };
    if (
      next.fileName !== existing.fileName
      || next.mimeType !== existing.mimeType
      || next.fileSize !== existing.fileSize
      || next.preview !== existing.preview
      || next.filePath !== existing.filePath
    ) {
      merged[existingIndex] = next;
      changed = true;
    }
  }

  return { files: merged, changed };
}

function findLocalAttachmentMatch(
  historyMessage: MessageWithLocalAttachments,
  localCandidates: MessageWithLocalAttachments[],
): MessageWithLocalAttachments | null {
  if (historyMessage.id) {
    const byId = localCandidates.find((message) => message.id === historyMessage.id);
    if (byId) return byId;
  }

  const historyMs = timestampToMs(historyMessage.timestamp);
  if (historyMs == null) return null;

  let bestMatch: MessageWithLocalAttachments | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of localCandidates) {
    const candidateMs = timestampToMs(candidate.timestamp);
    if (candidateMs == null) continue;
    const distance = Math.abs(candidateMs - historyMs);
    if (distance < bestDistance && distance < USER_ATTACHMENT_MATCH_WINDOW_MS) {
      bestDistance = distance;
      bestMatch = candidate;
    }
  }

  return bestMatch;
}

export function mergeLocalUserAttachmentMetadata<T extends MessageWithLocalAttachments>(
  historyMessages: T[],
  localMessages: MessageWithLocalAttachments[],
): T[] {
  const localCandidates = localMessages.filter(
    (message) => message.role === 'user' && (message._attachedFiles?.length ?? 0) > 0,
  );
  if (localCandidates.length === 0) {
    return historyMessages;
  }

  let changed = false;
  const mergedMessages = historyMessages.map((historyMessage) => {
    if (historyMessage.role !== 'user') {
      return historyMessage;
    }

    const localMatch = findLocalAttachmentMatch(historyMessage, localCandidates);
    const localFiles = localMatch?._attachedFiles;
    if (!localFiles || localFiles.length === 0) {
      return historyMessage;
    }

    const mergedFiles = mergeAttachmentLists(historyMessage._attachedFiles, localFiles);
    if (!mergedFiles.changed) {
      return historyMessage;
    }

    changed = true;
    return {
      ...historyMessage,
      _attachedFiles: mergedFiles.files,
    };
  });

  return changed ? mergedMessages : historyMessages;
}
