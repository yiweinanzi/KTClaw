import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import { RefreshCw, FileText, Save, X } from 'lucide-react';

interface MemoryFile {
  name: string;
  path: string;
  size: number;
  mtime: number;
}

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

export function SettingsMemoryBrowser() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
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
      const data = await hostApiFetch<{ files: MemoryFile[] }>('/api/memory');
      setFiles(data.files.sort((a, b) => b.mtime - a.mtime));
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
      const data = await hostApiFetch<{ content: string }>(
        `/api/memory/file?name=${encodeURIComponent(file.path)}`,
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
        body: JSON.stringify({ relativePath: selectedFile.path, content: draft }),
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
    <div className="flex min-h-[540px] gap-0 overflow-hidden rounded-xl border border-black/[0.08]">
      {/* Left panel */}
      <section
        role="region"
        aria-label="记忆文件列表"
        className="flex w-[220px] shrink-0 flex-col border-r border-black/[0.06] bg-white"
      >
        <div className="flex items-center justify-between border-b border-black/[0.06] px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.5px] text-[#8e8e93]">
            文件 ({files.length})
          </span>
          <button
            type="button"
            aria-label="刷新记忆文件列表"
            onClick={() => void fetchFiles()}
            disabled={loading}
            className="flex h-5 w-5 items-center justify-center rounded text-[#8e8e93] hover:text-[#000000] disabled:opacity-40"
          >
            <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-y-auto">
          {error && (
            <div className="px-3 py-2 text-[11px] text-[#ef4444]">{error}</div>
          )}
          {!error && files.length === 0 && !loading && (
            <div className="px-3 py-6 text-center text-[12px] text-[#8e8e93]">暂无记忆文件</div>
          )}
          {files.map((file) => (
            <button
              key={file.path}
              type="button"
              onClick={() => void openFile(file)}
              className={cn(
                'flex flex-col items-start gap-0.5 border-b border-black/[0.04] px-3 py-3 text-left transition-colors',
                selectedFile?.path === file.path ? 'bg-[#e8f1ff]' : 'hover:bg-[#f2f2f7]',
              )}
            >
              <div className="flex w-full items-center gap-1.5">
                <FileText className="h-3 w-3 shrink-0 text-clawx-ac" />
                <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#000000]">{file.name}</span>
              </div>
              <span className="pl-4 text-[11px] text-[#8e8e93]">
                {formatBytes(file.size)} · {relativeTime(file.mtime)}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Right panel */}
      <section
        role="region"
        aria-label="记忆预览"
        className="flex flex-1 flex-col overflow-hidden bg-white"
      >
        {!selectedFile ? (
          <div className="flex flex-1 items-center justify-center text-[13px] text-[#8e8e93]">
            选择左侧文件查看内容
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-3">
              <span className="text-[12px] font-medium text-[#000000]">{selectedFile.name}</span>
              <div className="flex items-center gap-2">
                {saveMsg && (
                  <span className={cn('text-[11px]', saveMsg.startsWith('保存失败') ? 'text-[#ef4444]' : 'text-[#10b981]')}>
                    {saveMsg}
                  </span>
                )}
                {editing ? (
                  <>
                    <button
                      type="button"
                      onClick={() => { setEditing(false); setDraft(fileContent); setSaveMsg(''); }}
                      className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-[#8e8e93] hover:bg-[#f2f2f7]"
                    >
                      <X className="h-3 w-3" /> 取消
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveFile()}
                      disabled={saving}
                      className="flex h-6 items-center gap-1 rounded bg-clawx-ac px-2 text-[11px] font-medium text-white hover:bg-[#0062cc] disabled:opacity-50"
                    >
                      <Save className="h-3 w-3" /> {saving ? '保存中...' : '保存'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setEditing(true); setSaveMsg(''); }}
                    className="flex h-6 items-center gap-1 rounded px-2 text-[11px] text-[#3c3c43] hover:bg-[#f2f2f7]"
                  >
                    编辑
                  </button>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-5">
              {fileLoading ? (
                <div className="text-[13px] text-[#8e8e93]">加载中...</div>
              ) : editing ? (
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="h-full min-h-[400px] w-full resize-none rounded-xl border border-black/[0.06] bg-[#fafafa] px-5 py-4 font-mono text-[13px] text-[#000000] outline-none focus:border-clawx-ac"
                  spellCheck={false}
                />
              ) : (
                <div className="rounded-xl border border-black/[0.06] bg-[#fafafa] px-6 py-5">
                  <pre className="whitespace-pre-wrap font-sans text-[13px] leading-7 text-[#111827]">
                    {fileContent}
                  </pre>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
