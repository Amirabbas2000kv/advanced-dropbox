import { useEffect, useState } from 'react';

import './ItemActions.css';

const ROOT_VALUE = '__root__';

export default function ItemActionDialog({
  dialog,
  onClose,
  onConfirm,
}) {
  const [name, setName] = useState('');
  const [destination, setDestination] = useState(ROOT_VALUE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!dialog) return;

    setName(
      dialog.action === 'rename'
        ? dialog.item?.name || ''
        : ''
    );

    const currentDestination =
      dialog.type === 'file'
        ? dialog.item?.folderId
        : dialog.action === 'create'
          ? dialog.parentFolderId
          : dialog.item?.parentId;

    setDestination(
      currentDestination === null ||
      currentDestination === undefined
        ? ROOT_VALUE
        : String(currentDestination)
    );

    setError('');
    setBusy(false);
  }, [dialog?.key]);

  if (!dialog) return null;

  const { action, type } = dialog;

  const isFolder = type === 'folder';

  const title =
    action === 'create'
      ? 'Create new folder'
      : action === 'rename'
        ? `Rename ${type}`
        : action === 'move'
          ? `Move ${type}`
          : isFolder
            ? 'Delete folder permanently'
            : 'Move file to trash';

  async function handleSubmit(event) {
    event.preventDefault();

    setError('');

    let value;

    if (action === 'rename' || action === 'create') {
      value = name.trim();

      if (!value) {
        setError('Name cannot be empty.');
        return;
      }

      if (value.length > 255) {
        setError('Name is too long.');
        return;
      }
    }

    if (action === 'move') {
      value =
        destination === ROOT_VALUE
          ? null
          : Number(destination);

      if (value !== null && !Number.isInteger(value)) {
        setError('Please select a valid destination.');
        return;
      }

      if (dialog.foldersError) {
        setError(dialog.foldersError);
        return;
      }
    }

    setBusy(true);

    try {
      await onConfirm(value);
    } catch (err) {
      setError(err.message || 'The operation failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="action-dialog-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onClose();
        }
      }}
    >
      <section
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="action-dialog-title"
      >
        <div className="action-dialog-header">
          <div>
            <p className="action-dialog-eyebrow">
              ADVANCED DROPBOX
            </p>

            <h2 id="action-dialog-title">
              {title}
            </h2>
          </div>

          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit}>

          {(action === 'create' || action === 'rename') && (
            <div className="dialog-field">
              <label htmlFor="action-name">
                Folder or file name
              </label>

              <input
                id="action-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={255}
                autoFocus
                required
              />
            </div>
          )}

          {action === 'move' && (
            <div className="dialog-field">
              <label htmlFor="move-destination">
                Destination
              </label>

              {dialog.loadingFolders ? (
                <p className="dialog-loading">
                  Loading available folders...
                </p>
              ) : dialog.foldersError ? (
                <p className="dialog-error">
                  {dialog.foldersError}
                </p>
              ) : (
                <select
                  id="move-destination"
                  value={destination}
                  onChange={(event) =>
                    setDestination(event.target.value)
                  }
                  disabled={busy}
                >
                  <option value={ROOT_VALUE}>
                    My Files (Root)
                  </option>

                  {(dialog.folders || []).map((folder) => (
                    <option
                      key={folder.id}
                      value={String(folder.id)}
                    >
                      {folder.path}
                    </option>
                  ))}
                </select>
              )}

              <p className="dialog-hint">
                Select the folder where this item should be placed.
              </p>
            </div>
          )}

          {action === 'delete' && (
            <div className="delete-warning">
              <div className="delete-warning-icon">
                ⚠
              </div>

              {isFolder ? (
                <>
                  <strong>
                    Permanent deletion
                  </strong>

                  <p>
                    This action permanently deletes this folder,
                    all its subfolders, and all files inside them,
                    including trashed files and old versions.
                    This cannot be undone.
                  </p>
                </>
              ) : (
                <>
                  <strong>
                    Move file to Trash
                  </strong>

                  <p>
                    This file will be moved to the Trash.
                    It can be restored later from the Trash page.
                  </p>
                </>
              )}
            </div>
          )}

          {error && (
            <div className="dialog-form-error">
              {error}
            </div>
          )}

          <div className="action-dialog-footer">

            <button
              type="button"
              className="dialog-cancel-button"
              onClick={onClose}
              disabled={busy}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={
                busy ||
                (action === 'move' && dialog.loadingFolders) ||
                (action === 'move' && Boolean(dialog.foldersError))
              }
              className={
                action === 'delete'
                  ? 'dialog-danger-button'
                  : 'dialog-confirm-button'
              }
            >
              {busy
                ? 'Please wait...'
                : action === 'create'
                  ? 'Create folder'
                  : action === 'rename'
                    ? 'Save changes'
                    : action === 'move'
                      ? 'Move item'
                      : isFolder
                        ? 'Delete permanently'
                        : 'Move to Trash'}
            </button>

          </div>

        </form>
      </section>
    </div>
  );
}