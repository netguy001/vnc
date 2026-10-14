import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Folder,
  FileText,
  Upload,
  Download,
  FolderPlus,
  RefreshCw,
  Trash2,
  Edit2,
  ChevronRight,
  ArrowUp,
  FileCode,
  HardDrive,
  CheckSquare,
  Square,
  X,
  Save,
  Loader2,
  UploadCloud,
} from 'lucide-react';
import { api } from '../../api/client';
import { SftpFileItem } from '@server-console/shared';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface SftpFileManagerProps {
  serverId: string;
  serverName: string;
}

const EDITABLE_EXTENSIONS = [
  '.txt', '.md', '.json', '.yml', '.yaml', '.conf', '.cfg', '.ini', '.env',
  '.sh', '.bash', '.js', '.ts', '.jsx', '.tsx', '.py', '.rb', '.go', '.rs',
  '.html', '.css', '.scss', '.xml', '.toml', '.log', '.service', '.gitignore',
];

function isEditable(name: string): boolean {
  const lower = name.toLowerCase();
  return EDITABLE_EXTENSIONS.some((ext) => lower.endsWith(ext)) || !lower.includes('.');
}

export const SftpFileManager: React.FC<SftpFileManagerProps> = ({ serverId, serverName }) => {
  const { showToast } = useToast();
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<SftpFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Modals state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<SftpFileItem | null>(null);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SftpFileItem | { bulk: true; count: number } | null>(null);
  const [editorTarget, setEditorTarget] = useState<SftpFileItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const loadFiles = async (targetPath: string) => {
    setIsLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const res = await api.listFiles(serverId, targetPath);
      setFiles(res.files);
      setCurrentPath(res.currentPath);
    } catch (err: any) {
      setError(err.message || 'Failed to list directory');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles(currentPath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const handleNavigate = (path: string) => {
    loadFiles(path);
  };

  const handleGoUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parent = '/' + parts.join('/');
    handleNavigate(parent);
  };

  const handleFileSelect = (item: SftpFileItem) => {
    if (item.isDirectory) {
      handleNavigate(item.path);
    } else if (isEditable(item.name) && item.size <= 2 * 1024 * 1024) {
      setEditorTarget(item);
    } else {
      handleDownload(item.path);
    }
  };

  const handleDownload = (path: string) => {
    const url = api.getDownloadUrl(serverId, path);
    window.open(url, '_blank');
  };

  const uploadFiles = async (fileList: File[]) => {
    if (fileList.length === 0) return;
    setUploadProgress({ done: 0, total: fileList.length });
    let failures = 0;
    for (let i = 0; i < fileList.length; i++) {
      try {
        await api.uploadFile(serverId, currentPath, fileList[i]);
      } catch (err: any) {
        failures++;
        showToast(`Failed to upload "${fileList[i].name}": ${err.message}`, 'error');
      }
      setUploadProgress({ done: i + 1, total: fileList.length });
    }
    setUploadProgress(null);
    if (failures === 0) {
      showToast(`Uploaded ${fileList.length} file${fileList.length === 1 ? '' : 's'}`, 'success');
    }
    await loadFiles(currentPath);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    if (fileInputRef.current) fileInputRef.current.value = '';
    await uploadFiles(picked);
  };

  // --- Drag and drop ---
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      dragCounter.current++;
      setIsDragOver(true);
    }
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = Math.max(0, dragCounter.current - 1);
    if (dragCounter.current === 0) setIsDragOver(false);
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    await uploadFiles(dropped);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const folderPath = currentPath.endsWith('/')
      ? `${currentPath}${newFolderName.trim()}`
      : `${currentPath}/${newFolderName.trim()}`;

    try {
      await api.mkdir(serverId, folderPath);
      setShowNewFolderModal(false);
      setNewFolderName('');
      await loadFiles(currentPath);
    } catch (err: any) {
      showToast('Create folder failed: ' + err.message, 'error');
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !newName.trim()) return;
    const oldPath = renameTarget.path;
    const dir = currentPath.endsWith('/') ? currentPath : `${currentPath}/`;
    const newPath = `${dir}${newName.trim()}`;

    try {
      await api.renamePath(serverId, oldPath, newPath);
      setRenameTarget(null);
      setNewName('');
      await loadFiles(currentPath);
    } catch (err: any) {
      showToast('Rename failed: ' + err.message, 'error');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    try {
      if ('bulk' in deleteTarget) {
        const targets = files.filter((f) => selected.has(f.path));
        for (const t of targets) {
          await api.deletePath(serverId, t.path, t.isDirectory);
        }
        showToast(`Deleted ${targets.length} item${targets.length === 1 ? '' : 's'}`, 'success');
      } else {
        await api.deletePath(serverId, deleteTarget.path, deleteTarget.isDirectory);
        showToast(`Deleted "${deleteTarget.name}"`, 'success');
      }
      setDeleteTarget(null);
      await loadFiles(currentPath);
    } catch (err: any) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  };

  // --- Selection helpers ---
  const toggleSelect = (path: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === files.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(files.map((f) => f.path)));
    }
  };

  const handleBulkDownload = () => {
    const targets = files.filter((f) => selected.has(f.path) && !f.isDirectory);
    targets.forEach((f) => handleDownload(f.path));
  };

  // Breadcrumbs parsing
  const breadcrumbParts = currentPath.split('/').filter(Boolean);
  const hasSelection = selected.size > 0;

  return (
    <div
      className="flex flex-col h-full bg-panel-inset border border-border rounded-lg overflow-hidden shadow-2xl relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-40 bg-sky-950/80 border-4 border-dashed border-sky-500 flex flex-col items-center justify-center pointer-events-none">
          <UploadCloud className="w-10 h-10 text-sky-400 mb-2" />
          <span className="text-sm font-medium text-sky-200">Drop files to upload to {currentPath}</span>
        </div>
      )}

      {/* Upload progress overlay */}
      {uploadProgress && (
        <div className="absolute top-2 right-2 z-40 px-3 py-2 bg-panel border border-border-strong rounded-lg shadow-xl flex items-center gap-2 text-xs text-content-secondary">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
          Uploading {uploadProgress.done}/{uploadProgress.total}…
        </div>
      )}

      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-panel border-b border-border text-xs text-content-secondary gap-2">
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px] overflow-x-auto py-1">
          <button
            onClick={() => handleNavigate('/')}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-panel-alt text-content-muted hover:text-content-primary font-mono"
            title="Root directory"
          >
            <HardDrive className="w-3.5 h-3.5 text-sky-400" />
            <span>/</span>
          </button>

          {breadcrumbParts.map((part, index) => {
            const pathSoFar = '/' + breadcrumbParts.slice(0, index + 1).join('/');
            const isLast = index === breadcrumbParts.length - 1;
            return (
              <React.Fragment key={pathSoFar}>
                <ChevronRight className="w-3.5 h-3.5 text-content-muted flex-shrink-0" />
                <button
                  onClick={() => handleNavigate(pathSoFar)}
                  className={`px-1.5 py-0.5 rounded font-mono truncate max-w-[120px] transition ${
                    isLast
                      ? 'bg-panel-alt text-sky-300 font-medium'
                      : 'hover:bg-panel-alt text-content-muted hover:text-content-primary'
                  }`}
                >
                  {part}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1.5">
          <input ref={fileInputRef} type="file" multiple onChange={handleFileInputChange} className="hidden" />

          {hasSelection ? (
            <>
              <span className="text-content-muted mr-1">{selected.size} selected</span>
              <button
                onClick={handleBulkDownload}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-panel-alt hover:bg-border text-sky-400 border border-border"
                title="Download selected files"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
              <button
                onClick={() => setDeleteTarget({ bulk: true, count: selected.size })}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-700/50"
                title="Delete selected items"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="p-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border"
                title="Clear selection"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleGoUp}
                disabled={currentPath === '/' || currentPath === ''}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-panel-alt hover:bg-border disabled:opacity-40 text-content-secondary border border-border"
                title="Go up one folder"
              >
                <ArrowUp className="w-3.5 h-3.5" />
                <span>Up</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium"
                title="Upload files to current directory (or drag & drop)"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload</span>
              </button>

              <button
                onClick={() => {
                  setNewFolderName('');
                  setShowNewFolderModal(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-panel-alt hover:bg-border text-content-primary border border-border"
                title="Create new folder"
              >
                <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
                <span>New Folder</span>
              </button>

              <button
                onClick={() => loadFiles(currentPath)}
                disabled={isLoading}
                className="p-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary border border-border disabled:opacity-50"
                title="Refresh directory"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main File Table */}
      <div className="flex-1 overflow-auto bg-panel-inset">
        {error && (
          <div className="p-4 m-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">{error}</div>
        )}

        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-panel border-b border-border text-content-muted select-none">
            <tr>
              <th className="py-2.5 px-3 w-8">
                <button onClick={toggleSelectAll} className="flex items-center" title="Select all">
                  {selected.size === files.length && files.length > 0 ? (
                    <CheckSquare className="w-4 h-4 text-sky-400" />
                  ) : (
                    <Square className="w-4 h-4 text-content-muted" />
                  )}
                </button>
              </th>
              <th className="py-2.5 px-2 font-medium">Name</th>
              <th className="py-2.5 px-4 font-medium w-28">Size</th>
              <th className="py-2.5 px-4 font-medium w-24">Perms</th>
              <th className="py-2.5 px-4 font-medium w-36">Modified</th>
              <th className="py-2.5 px-4 font-medium w-28 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 font-mono text-content-secondary">
            {files.length === 0 && !isLoading && !error && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-content-muted italic">
                  Folder is empty — drag & drop files here to upload
                </td>
              </tr>
            )}

            {files.map((item) => {
              const isChecked = selected.has(item.path);
              return (
                <tr
                  key={item.path}
                  onDoubleClick={() => handleFileSelect(item)}
                  className={`hover:bg-panel-alt/60 transition cursor-pointer group ${isChecked ? 'bg-sky-600/10' : ''}`}
                >
                  <td className="py-2 px-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelect(item.path);
                      }}
                      className="flex items-center"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Square className="w-4 h-4 text-content-muted opacity-0 group-hover:opacity-100 transition" />
                      )}
                    </button>
                  </td>
                  <td className="py-2 px-2 flex items-center gap-2.5 font-sans">
                    {item.isDirectory ? (
                      <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
                    ) : item.name.endsWith('.sh') || item.name.endsWith('.js') || item.name.endsWith('.json') ? (
                      <FileCode className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <FileText className="w-4 h-4 text-content-muted flex-shrink-0" />
                    )}
                    <span className="truncate max-w-md group-hover:text-sky-300 transition">{item.name}</span>
                  </td>
                  <td className="py-2 px-4 text-content-muted">{item.isDirectory ? '—' : item.sizeFormatted}</td>
                  <td className="py-2 px-4 text-content-muted text-[11px]">{item.permissions}</td>
                  <td className="py-2 px-4 text-content-muted text-[11px]">
                    {new Date(item.modifiedTime).toLocaleDateString()}{' '}
                    {new Date(item.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                      {!item.isDirectory && isEditable(item.name) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditorTarget(item);
                          }}
                          className="p-1 rounded hover:bg-border text-emerald-400"
                          title="Edit file"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!item.isDirectory && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(item.path);
                          }}
                          className="p-1 rounded hover:bg-border text-sky-400"
                          title="Download"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setRenameTarget(item);
                          setNewName(item.name);
                        }}
                        className="p-1 rounded hover:bg-border text-amber-400"
                        title="Rename"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(item);
                        }}
                        className="p-1 rounded hover:bg-border text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-border-strong rounded-lg max-w-sm w-full p-4 shadow-2xl">
            <h3 className="font-semibold text-content-primary text-sm mb-3">Create New Folder</h3>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
              placeholder="Folder name"
              className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-xs text-content-primary focus:outline-none focus:border-sky-500 mb-4"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="px-3 py-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-panel border border-border-strong rounded-lg max-w-sm w-full p-4 shadow-2xl">
            <h3 className="font-semibold text-content-primary text-sm mb-3">Rename Item</h3>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              placeholder="New name"
              className="w-full px-3 py-2 bg-panel-alt border border-border rounded text-xs text-content-primary focus:outline-none focus:border-sky-500 mb-4"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-3 py-1.5 rounded bg-panel-alt hover:bg-border text-content-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleRename}
                disabled={!newName.trim()}
                className="px-3 py-1.5 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-medium"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        title={deleteTarget && 'bulk' in deleteTarget ? 'Delete selected items' : 'Delete item'}
        description={
          deleteTarget
            ? 'bulk' in deleteTarget
              ? `Permanently delete ${deleteTarget.count} selected item${deleteTarget.count === 1 ? '' : 's'}? This cannot be undone.`
              : `Permanently delete "${deleteTarget.name}"?${
                  deleteTarget.isDirectory ? ' This will remove the directory and its contents.' : ''
                }`
            : ''
        }
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Inline Text Editor */}
      {editorTarget && (
        <FileEditorModal
          serverId={serverId}
          file={editorTarget}
          onClose={() => setEditorTarget(null)}
          onSaved={() => loadFiles(currentPath)}
        />
      )}
    </div>
  );
};

// ---------- Inline text editor modal ----------

const FileEditorModal: React.FC<{
  serverId: string;
  file: SftpFileItem;
  onClose: () => void;
  onSaved: () => void;
}> = ({ serverId, file, onClose, onSaved }) => {
  const { showToast } = useToast();
  const [content, setContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .readFileContent(serverId, file.path)
      .then((res) => {
        if (cancelled) return;
        setContent(res.content);
        setOriginalContent(res.content);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err.message || 'Failed to load file');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serverId, file.path]);

  const isDirty = content !== originalContent;

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      await api.writeFileContent(serverId, file.path, content);
      setOriginalContent(content);
      showToast(`Saved "${file.name}"`, 'success');
      onSaved();
    } catch (err: any) {
      showToast(err.message || 'Failed to save file', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [serverId, file.path, file.name, content, onSaved, showToast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (isDirty && !isSaving) handleSave();
      } else if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isDirty, isSaving, handleSave, onClose]);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-panel border border-border-strong rounded-xl max-w-3xl w-full h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
          <div className="flex items-center gap-2 text-xs">
            <FileCode className="w-4 h-4 text-emerald-400" />
            <span className="font-mono text-content-primary">{file.path}</span>
            {isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved changes" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={!isDirty || isSaving || isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white rounded text-xs font-medium transition"
              title="Save (Ctrl+S)"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
            <button onClick={onClose} className="p-1.5 rounded text-content-muted hover:text-content-secondary hover:bg-panel-alt">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden bg-panel-inset">
          {isLoading ? (
            <div className="h-full flex items-center justify-center text-content-muted text-xs gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading file…
            </div>
          ) : loadError ? (
            <div className="h-full flex items-center justify-center text-rose-400 text-xs px-6 text-center">
              {loadError}
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              spellCheck={false}
              className="w-full h-full p-4 bg-transparent text-content-primary font-mono text-xs leading-relaxed resize-none focus:outline-none"
            />
          )}
        </div>
      </div>
    </div>
  );
};
