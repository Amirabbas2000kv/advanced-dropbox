import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  getTrashFiles,
  restoreTrashedFile,
  permanentlyDeleteTrashedFile,
} from '../api/trash';

import './TrashPage.css';

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
    hour: '2-digit',
    minute: '2-digit',
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

export default function TrashPage() {
  const navigate = useNavigate();

  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  const loadTrash = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getTrashFiles();

      setFiles(data.files);
    } catch (err) {
      setError(
        err.message || 'Could not load Trash.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTrash();
  }, [loadTrash]);

  async function handleRestore(file) {
    setBusyId(`restore-${file.id}`);
    setError('');
    setNotice('');

    try {
      await restoreTrashedFile(file.id);

      setFiles((current) =>
        current.filter(
          (item) => String(item.id) !== String(file.id)
        )
      );

      setNotice(
        `"${file.name}" was restored successfully.`
      );
    } catch (err) {
      setError(err.message || 'Could not restore file.');
    } finally {
      setBusyId(null);
    }
  }

  async function handlePermanentDelete(file) {
    const confirmed = window.confirm(
      `Permanently delete "${file.name}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    setBusyId(`delete-${file.id}`);
    setError('');
    setNotice('');

    try {
      await permanentlyDeleteTrashedFile(file.id);

      setFiles((current) =>
        current.filter(
          (item) => String(item.id) !== String(file.id)
        )
      );

      setNotice(
        `"${file.name}" was permanently deleted.`
      );
    } catch (err) {
      setError(
        err.message || 'Could not permanently delete file.'
      );
    } finally {
      setBusyId(null);
    }
  }

  const totalSize = files.reduce(
    (total, file) => total + Number(file.size || 0),
    0
  );

  return (
    <main className="trash-page">

      <header className="trash-header">

        <div className="trash-brand">
          <div className="brand-mark">D</div>
          <span>Advanced Dropbox</span>
        </div>

        <button
          className="trash-back-button"
          onClick={() => navigate('/dashboard')}
        >
          ← Back to My Files
        </button>

      </header>

      <div className="trash-content">

        <section className="trash-heading">

          <div>
            <p className="trash-eyebrow">
              FILE MANAGEMENT
            </p>

            <h1>
              🗑️ Trash
            </h1>

            <p>
              Restore deleted files or permanently remove them.
            </p>
          </div>

          <button
            className="trash-refresh-button"
            onClick={loadTrash}
            disabled={loading || busyId !== null}
          >
            ↻ Refresh
          </button>

        </section>

        <section className="trash-summary">

          <div className="trash-summary-item">
            <span className="summary-icon">📄</span>

            <div>
              <strong>{files.length}</strong>
              <span>Deleted files</span>
            </div>
          </div>

          <div className="trash-summary-item">
            <span className="summary-icon">💾</span>

            <div>
              <strong>{formatBytes(totalSize)}</strong>
              <span>Storage occupied</span>
            </div>
          </div>

        </section>

        {notice && (
          <div className="trash-notice" role="status">
            <span>✓ {notice}</span>

            <button
              onClick={() => setNotice('')}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <div className="trash-error" role="alert">
            <span>⚠ {error}</span>

            <button onClick={loadTrash}>
              Try again
            </button>
          </div>
        )}

        <section className="trash-list-section">

          <div className="trash-list-heading">
            <h2>Deleted items</h2>
            <span>{files.length} items</span>
          </div>

          {loading ? (
            <div className="trash-loading">
              <div className="trash-spinner"></div>
              <p>Loading deleted files...</p>
            </div>
          ) : error ? null : files.length === 0 ? (
            <div className="trash-empty">

              <div className="trash-empty-icon">
                🗑️
              </div>

              <h3>Your Trash is empty</h3>

              <p>
                Files you delete will appear here.
                You can restore them whenever you need.
              </p>

              <button
                onClick={() => navigate('/dashboard')}
              >
                Back to My Files
              </button>

            </div>
          ) : (
            <div className="trash-table-wrapper">

              <table className="trash-table">

                <thead>
                  <tr>
                    <th>File name</th>
                    <th>File size</th>
                    <th>Deleted at</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {files.map((file) => (
                    <tr key={file.id}>

                      <td>
                        <div className="trash-file-name">

                          <span className="trash-file-icon">
                            {getFileIcon(file.mimeType)}
                          </span>

                          <strong>{file.name}</strong>

                        </div>
                      </td>

                      <td>
                        {formatBytes(file.size)}
                      </td>

                      <td>
                        {formatDate(file.deletedAt)}
                      </td>

                      <td>
                        <div className="trash-actions">

                          <button
                            className="trash-restore-button"
                            disabled={busyId !== null}
                            onClick={() => handleRestore(file)}
                          >
                            {busyId === `restore-${file.id}`
                              ? 'Restoring...'
                              : '↶ Restore'}
                          </button>

                          <button
                            className="trash-delete-button"
                            disabled={busyId !== null}
                            onClick={() =>
                              handlePermanentDelete(file)
                            }
                          >
                            {busyId === `delete-${file.id}`
                              ? 'Deleting...'
                              : 'Delete forever'}
                          </button>

                        </div>
                      </td>

                    </tr>
                  ))}
                </tbody>

              </table>

            </div>
          )}

        </section>

        <footer className="trash-footer">
          Advanced Dropbox · Trash Management
        </footer>

      </div>

    </main>
  );
}