/**
 * Memory Page — 记忆/知识库浏览器
 * 对接 /api/memory，展示 ~/.openclaw/workspace 下的 .md 文件
 */
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import { RefreshCw, FileText, Save, X, FolderOpen } from 'lucide-react';

/* ─── Types ─── */

interface MemoryFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

interface MemoryListResponse {
  files: MemoryFile[];
  workspaceDir: string;
}

/* ─── Helpers ─── */

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)}KB`;
  return `${(kb / 1024).toFixed(1)}MB`;
}

function relativeTime(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return `${Math.floor(diff / 86400)}天前`;
}

/* ─── Main component ─── */

export function Memory() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [workspaceDir, setWorkspaceDir] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<MemoryFile | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await hostApiFetch<MemoryListResponse>('/api/memory');
      setFiles(data.files.sort((a, b) => b.mtime - a.mtime));
      setWorkspaceDir(data.workspaceDir);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchFiles(); }, [fetchFiles]);

  const openFile = useCallback(async (file: MemoryFile) => {
    setSelectedFile(file);
    setEditing(false);
    setSaveMsg('');
    setFileLoading(true);
    try {
      const data = await hostApiFetch<{ name: string; content: string }>(
        `/api/memory/file?name=${encodeURIComponent(file.name)}`,
      );
      setFileContent(data.content);
      setDraft(data.content);
    } catch (e) {
      setFileContent(`读取失败: ${String(e)}`);
    } finally {
      setFileLoading(false);
    }
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    setSaveMsg('');
    try {
      await hostApiFetch('/api/memory/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: selectedFile.name, content: draft }),
      });
      setFileContent(draft);
      setEditing(false);
      setSaveMsg('已保存');
      void fetchFiles();
    } catch (e) {
      setSaveMsg(`保存失败: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }, [selectedFile, draft, fetchFiles]);

  return (
    <div className="flex h-full flex-col bg-[#f2f2f7]">
      {/* Header */}
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#c6c6c8] bg-white px-5">
        <div>
          <h1 className="text-[15px] font-semibold text-[#000000]">记忆 / 知识库</h1>
          {workspaceDir && (
            <p className="flex items-center gap-1 text-[11px] text-[#8e8e93]">
              <FolderOpen className="h-3 w-3" />
              {workspaceDir}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void fetchFiles()}
          disabled={loading}
          className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] text-[#3c3c43] transition-colors hover:bg-[#f2f2f7] disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
          刷新
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* File list */}
        <div className="flex w-[240px] shrink-0 flex-col border-r border-[#c6c6c8] bg-white">
          <div className="border-b border-[#f2f2f7] px-4 py-2.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8e8e93]">
              文件 ({files.length})
            </span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {error && (
              <div className="px-4 py-3 text-[12px] text-[#ef4444]">{error}</div>
            )}
            {!error && files.length === 0 && !loading && (
              <div className="px-4 py-6 text-center text-[13px] text-[#8e8e93]">
                暂无记忆文件
              </div>
            )}
            {files.map((file) => (
              <button
                key={file.name}
                type="button"
                onClick={() => void openFile(file)}
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b border-[#f2f2f7] px-4 py-3 text-left transition-colors hover:bg-[#f2f2f7]',
                  selectedFile?.name === file.name && 'bg-[#e5e5ea]',
                )}
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#007aff]" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[#000000]">
                    {file.name}
                  </span>
                </div>
                <div className="flex items-center justify-between pl-5">
                  <span className="text-[11px] text-[#8e8e93]">{formatBytes(file.size)}</span>
                  <span className="text-[11px] text-[#c6c6c8]">{relativeTime(file.mtime)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* File viewer / editor */}
        <div className="flex min-w-0 flex-1 flex-col">
          {!selectedFile ? (
            <div className="flex flex-1 items-center justify-center text-[14px] text-[#8e8e93]">
              选择左侧文件查看内容
            </div>
          ) : (
            <>
              {/* File header */}
              <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-[#c6c6c8] bg-white px-5">
                <span className="text-[13px] font-medium text-[#000000]">{selectedFile.name}</span>
                <div className="flex items-center gap-2">
                  {saveMsg && (
                    <span className={cn('text-[12px]', saveMsg.startsWith('保存失败') ? 'text-[#ef4444]' : 'text-[#10b981]')}>
                      {saveMsg}
                    </span>
                  )}
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEditing(false); setDraft(fileContent); setSaveMsg(''); }}
                        className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] text-[#8e8e93] hover:bg-[#f2f2f7]"
                      >
                        <X className="h-3.5 w-3.5" />
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveFile()}
                        disabled={saving}
                        className="flex h-7 items-center gap-1 rounded-lg bg-[#007aff] px-2.5 text-[12px] font-medium text-white hover:bg-[#0062cc] disabled:opacity-50"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? '保存中...' : '保存'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setEditing(true); setSaveMsg(''); }}
                      className="flex h-7 items-center gap-1 rounded-lg px-2.5 text-[12px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                    >
                      编辑
                    </button>
                  )}
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-auto p-5">
                {fileLoading ? (
                  <div className="text-[13px] text-[#8e8e93]">加载中...</div>
                ) : editing ? (
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="h-full min-h-[400px] w-full resize-none rounded-lg border border-[#c6c6c8] bg-white p-4 font-mono text-[13px] text-[#000000] outline-none focus:border-[#007aff]"
                    spellCheck={false}
                  />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[13px] leading-relaxed text-[#000000]">
                    {fileContent}
                  </pre>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
