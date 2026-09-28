import React, { useState, useEffect, useRef } from 'react';
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
  Shield,
  Clock,
} from 'lucide-react';
import { api } from '../../api/client';
import { SftpFileItem } from '@server-console/shared';

interface SftpFileManagerProps {
  serverId: string;
  serverName: string;
}

export const SftpFileManager: React.FC<SftpFileManagerProps> = ({ serverId, serverName }) => {
  const [currentPath, setCurrentPath] = useState('/');
  const [files, setFiles] = useState<SftpFileItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState<SftpFileItem | null>(null);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<SftpFileItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = async (targetPath: string) => {
    setIsLoading(true);
    setError(null);
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
    } else {
      // Trigger download
      handleDownload(item.path);
    }
  };

  const handleDownload = (path: string) => {
    const url = api.getDownloadUrl(serverId, path);
    window.open(url, '_blank');
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setIsLoading(true);
    try {
      await api.uploadFile(serverId, currentPath, selectedFile);
      await loadFiles(currentPath);
    } catch (err: any) {
      alert('Upload failed: ' + err.message);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
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
      alert('Create folder failed: ' + err.message);
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
      alert('Rename failed: ' + err.message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await api.deletePath(serverId, deleteTarget.path, deleteTarget.isDirectory);
      setDeleteTarget(null);
      await loadFiles(currentPath);
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  // Breadcrumbs parsing
  const breadcrumbParts = currentPath.split('/').filter(Boolean);

  return (
    <div className="flex flex-col h-full bg-[#0a0f1d] border border-slate-800 rounded-lg overflow-hidden shadow-2xl">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-300 gap-2">
        {/* Navigation Breadcrumbs */}
        <div className="flex items-center gap-1.5 flex-1 min-w-[200px] overflow-x-auto py-1">
          <button
            onClick={() => handleNavigate('/')}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-100 font-mono"
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
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                <button
                  onClick={() => handleNavigate(pathSoFar)}
                  className={`px-1.5 py-0.5 rounded font-mono truncate max-w-[120px] transition ${
                    isLast
                      ? 'bg-slate-800 text-sky-300 font-medium'
                      : 'hover:bg-slate-800 text-slate-400 hover:text-slate-100'
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
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
          />

          <button
            onClick={handleGoUp}
            disabled={currentPath === '/' || currentPath === ''}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 border border-slate-700"
            title="Go up one folder"
          >
            <ArrowUp className="w-3.5 h-3.5" />
            <span>Up</span>
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium"
            title="Upload file to current directory"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Upload</span>
          </button>

          <button
            onClick={() => {
              setNewFolderName('');
              setShowNewFolderModal(true);
            }}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
            title="Create new folder"
          >
            <FolderPlus className="w-3.5 h-3.5 text-amber-400" />
            <span>New Folder</span>
          </button>

          <button
            onClick={() => loadFiles(currentPath)}
            disabled={isLoading}
            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 disabled:opacity-50"
            title="Refresh directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-sky-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main File Table */}
      <div className="flex-1 overflow-auto bg-[#0a0f1d]">
        {error && (
          <div className="p-4 m-3 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {error}
          </div>
        )}

        <table className="w-full text-left text-xs border-collapse">
          <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400 select-none">
            <tr>
              <th className="py-2.5 px-4 font-medium">Name</th>
              <th className="py-2.5 px-4 font-medium w-28">Size</th>
              <th className="py-2.5 px-4 font-medium w-24">Perms</th>
              <th className="py-2.5 px-4 font-medium w-36">Modified</th>
              <th className="py-2.5 px-4 font-medium w-24 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300">
            {files.length === 0 && !isLoading && !error && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 italic">
                  Folder is empty
                </td>
              </tr>
            )}

            {files.map((item) => (
              <tr
                key={item.path}
                onDoubleClick={() => handleFileSelect(item)}
                className="hover:bg-slate-800/40 transition cursor-pointer group"
              >
                <td className="py-2 px-4 flex items-center gap-2.5 font-sans">
                  {item.isDirectory ? (
                    <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  ) : item.name.endsWith('.sh') || item.name.endsWith('.js') || item.name.endsWith('.json') ? (
                    <FileCode className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  )}
                  <span className="truncate max-w-md group-hover:text-sky-300 transition">
                    {item.name}
                  </span>
                </td>
                <td className="py-2 px-4 text-slate-400">
                  {item.isDirectory ? '—' : item.sizeFormatted}
                </td>
                <td className="py-2 px-4 text-slate-400 text-[11px]">
                  {item.permissions}
                </td>
                <td className="py-2 px-4 text-slate-400 text-[11px]">
                  {new Date(item.modifiedTime).toLocaleDateString()} {new Date(item.modifiedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="py-2 px-4 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                    {!item.isDirectory && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(item.path);
                        }}
                        className="p-1 rounded hover:bg-slate-700 text-sky-400"
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
                      className="p-1 rounded hover:bg-slate-700 text-amber-400"
                      title="Rename"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(item);
                      }}
                      className="p-1 rounded hover:bg-slate-700 text-rose-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* New Folder Modal */}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-sm w-full p-4 shadow-2xl">
            <h3 className="font-semibold text-slate-100 text-sm mb-3">Create New Folder</h3>
            <input
              type="text"
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-sky-500 mb-4"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
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
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-sm w-full p-4 shadow-2xl">
            <h3 className="font-semibold text-slate-100 text-sm mb-3">Rename Item</h3>
            <input
              type="text"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New name"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-sky-500 mb-4"
            />
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setRenameTarget(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
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

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg max-w-sm w-full p-4 shadow-2xl">
            <h3 className="font-semibold text-rose-400 text-sm mb-2">Confirm Delete</h3>
            <p className="text-xs text-slate-300 mb-4">
              Are you sure you want to permanently delete <strong className="text-slate-100 font-mono">"{deleteTarget.name}"</strong>?
              {deleteTarget.isDirectory && ' This will remove the directory and its contents.'}
            </p>
            <div className="flex justify-end gap-2 text-xs">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
