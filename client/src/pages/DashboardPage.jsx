import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import {
  getFolderContents,
  getStorageUsage,
} from '../api/workspace';

import './DashboardPage.css';

function formatBytes(bytes) {
  const value = Number(bytes);

  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];

  const index = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1
  );

  return `${(value / Math.pow(1024, index)).toFixed(
    index === 0 ? 0 : 1
  )} ${units[index]}`;
}

function formatDate(date) {
  if (!date) return '—';

  const parsed = new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return '—';
  }

  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(parsed);
}

function getFileIcon(mimeType = '') {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.startsWith('video/')) return '🎬';
  if (mimeType.startsWith('audio/')) return '🎵';
  if (mimeType === 'application/pdf') return '📕';
  if (mimeType.startsWith('text/')) return '📝';

  return '📄';
}

export default function DashboardPage() {
  const navigate = useNavigate();

  const { user, logout } = useAuth();

  const requestSequence = useRef(0);

  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);

  const [currentFolder, setCurrentFolder] = useState(null);
  const [breadcrumbs, setBreadcrumbs] = useState([]);

  const [storage, setStorage] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadWorkspace = useCallback(async (folderId = null) => {
    const requestId = ++requestSequence.current;

    setLoading(true);
    setError('');

    try {
      const [content, storageData] = await Promise.all([
        getFolderContents(folderId),
        getStorageUsage(),
      ]);

      // Build the complete folder path from the current folder
      // back to the root.
      const folderPath = [];

      if (content.current) {
        const reversePath = [content.current];

        const visited = new Set([
          String(content.current.id),
        ]);

        let parentId = content.current.parentId;

        for (
          let depth = 0;
          parentId !== null &&
          parentId !== undefined &&
          depth < 50;
          depth++
        ) {
          const parentKey = String(parentId);

          if (visited.has(parentKey)) {
            break;
          }

          const parentContent = await getFolderContents(parentId);

          if (!parentContent.current) {
            break;
          }

          const parent = parentContent.current;

          reversePath.push(parent);
          visited.add(String(parent.id));

          parentId = parent.parentId;
        }

        folderPath.push(...reversePath.reverse());
      }

      // Ignore outdated responses when the user navigates quickly.
      if (requestId !== requestSequence.current) {
        return;
      }

      setCurrentFolder(content.current || null);

      setFolders(
        Array.isArray(content.folders)
          ? content.folders
          : []
      );

      setFiles(
        Array.isArray(content.files)
          ? content.files
          : []
      );

      setBreadcrumbs(folderPath);
      setStorage(storageData);
    } catch (err) {
      if (requestId !== requestSequence.current) {
        return;
      }

      setError(
        err.message || 'Could not load your workspace.'
      );
    } finally {
      if (requestId === requestSequence.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadWorkspace(null);

    return () => {
      requestSequence.current++;
    };
  }, [loadWorkspace]);

  function handleLogout() {
    logout();

    navigate('/login', {
      replace: true,
    });
  }

  const usedStorage = Number(storage?.used || 0);
  const storageLimit = Number(storage?.limit || 0);

  const storagePercent = Math.min(
    100,
    Math.max(0, Number(storage?.percent || 0))
  );

  const userName = user?.name || 'User';

  const userInitial = (
    user?.name ||
    user?.email ||
    'U'
  ).charAt(0).toUpperCase();

  return (
    <div className="workspace-shell">

      {/* Sidebar */}

      <aside className="workspace-sidebar">

        <div className="workspace-brand">
          <div className="brand-mark">D</div>
          <span>Advanced Dropbox</span>
        </div>

        <div className="sidebar-section-label">
          WORKSPACE
        </div>

        <button
          className="sidebar-link active"
          onClick={() => loadWorkspace(null)}
        >
          <span>⌂</span>
          My Files
        </button>

        <div className="sidebar-storage">

          <div className="sidebar-storage-title">
            <span>☁</span>
            Storage
          </div>

          {storage ? (
            <>
              <div
                className="storage-progress"
                role="progressbar"
                aria-label="Storage usage"
                aria-valuenow={storagePercent}
                aria-valuemin="0"
                aria-valuemax="100"
              >
                <div
                  className="storage-progress-fill"
                  style={{ width: `${storagePercent}%` }}
                />
              </div>

              <div className="storage-details">
                <strong>
                  {formatBytes(usedStorage)}
                </strong>

                <span>
                  of {formatBytes(storageLimit)}
                </span>
              </div>

              <p className="storage-caption">
                {storagePercent.toFixed(1)}% used
              </p>
            </>
          ) : (
            <p className="storage-caption">
              Loading storage...
            </p>
          )}

        </div>

        <div className="sidebar-profile">

          <div className="profile-avatar">
            {userInitial}
          </div>

          <div className="profile-details">
            <strong>{userName}</strong>
            <span>{user?.email}</span>
          </div>

        </div>

        <button
          className="sidebar-logout"
          onClick={handleLogout}
        >
          <span>↪</span>
          Sign out
        </button>

      </aside>

      {/* Main Content */}

      <main className="workspace-main">

        <header className="workspace-topbar">

          <nav
            className="breadcrumbs"
            aria-label="Folder navigation"
          >

            <button
              onClick={() => loadWorkspace(null)}
            >
              My Files
            </button>

            {breadcrumbs.map((folder, index) => (
              <span
                className="breadcrumb-item"
                key={folder.id}
              >
                <span className="breadcrumb-separator">
                  /
                </span>

                {index === breadcrumbs.length - 1 ? (
                  <span aria-current="page">
                    {folder.name}
                  </span>
                ) : (
                  <button
                    onClick={() => loadWorkspace(folder.id)}
                  >
                    {folder.name}
                  </button>
                )}
              </span>
            ))}

          </nav>

          <button
            className="refresh-button"
            onClick={() => loadWorkspace(currentFolder?.id ?? null)}
            disabled={loading}
            title="Refresh workspace"
          >
            ↻ Refresh
          </button>

        </header>

        <div className="workspace-content">

          <section className="workspace-heading">

            <div>
              <p className="workspace-eyebrow">
                YOUR CLOUD WORKSPACE
              </p>

              <h1>
                {currentFolder?.name || 'My Files'}
              </h1>

              <p className="workspace-description">
                Manage and organize your personal files.
              </p>
            </div>

            <div className="workspace-counts">

              <div className="count-card">
                <span>📁</span>
                <div>
                  <strong>{folders.length}</strong>
                  <small>Folders</small>
                </div>
              </div>

              <div className="count-card">
                <span>📄</span>
                <div>
                  <strong>{files.length}</strong>
                  <small>Files</small>
                </div>
              </div>

            </div>

          </section>

          {error && (
            <div className="workspace-error">
              <span>⚠</span>
              <span>{error}</span>

              <button
                onClick={() => loadWorkspace(null)}
              >
                Back to My Files
              </button>
            </div>
          )}

          {loading ? (
            <div className="workspace-loading">
              <div className="workspace-spinner"></div>
              <p>Loading your workspace...</p>
            </div>
          ) : !error ? (
            <>

              {/* Folder Section */}

              <section className="items-section">

                <div className="section-heading">
                  <h2>Folders</h2>
                  <span>{folders.length} items</span>
                </div>

                {folders.length > 0 ? (
                  <div className="folder-grid">

                    {folders.map((folder) => (
                      <button
                        className="folder-card"
                        key={folder.id}
                        onClick={() => loadWorkspace(folder.id)}
                      >

                        <span className="folder-card-icon">
                          📁
                        </span>

                        <span className="folder-card-name">
                          {folder.name}
                        </span>

                        <span className="folder-card-arrow">
                          →
                        </span>

                      </button>
                    ))}

                  </div>
                ) : (
                  <div className="empty-state">
                    <span>📂</span>
                    <strong>No folders yet</strong>
                    <p>
                      Folders will appear here when available.
                    </p>
                  </div>
                )}

              </section>

              {/* File Section */}

              <section className="items-section files-section">

                <div className="section-heading">
                  <h2>Files</h2>
                  <span>{files.length} items</span>
                </div>

                {files.length > 0 ? (
                  <div className="file-table-wrapper">

                    <table className="file-table">

                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>File size</th>
                          <th>Date added</th>
                        </tr>
                      </thead>

                      <tbody>
                        {files.map((file) => (
                          <tr key={file.id}>

                            <td>
                              <div className="file-name-cell">

                                <span className="file-type-icon">
                                  {getFileIcon(file.mimeType)}
                                </span>

                                <span className="file-name">
                                  {file.name}
                                </span>

                              </div>
                            </td>

                            <td className="file-size">
                              {formatBytes(file.size)}
                            </td>

                            <td className="file-date">
                              {formatDate(file.createdAt)}
                            </td>

                          </tr>
                        ))}
                      </tbody>

                    </table>

                  </div>
                ) : (
                  <div className="empty-state">
                    <span>📄</span>
                    <strong>No files yet</strong>
                    <p>
                      Your uploaded files will appear here.
                    </p>
                  </div>
                )}

              </section>

            </>
          ) : null}

          <footer className="workspace-footer">
            Advanced Dropbox · Personal Cloud Storage
          </footer>

        </div>

      </main>

    </div>
  );
}