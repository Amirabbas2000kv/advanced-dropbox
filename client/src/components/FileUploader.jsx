import { useRef, useState } from 'react';

import {
  NORMAL_UPLOAD_LIMIT,
  MAX_UPLOAD_SIZE,
  uploadRegularFile,
  uploadChunkedFile,
} from '../api/uploads';

import './FileUploader.css';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];

  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  return `${(bytes / Math.pow(1024, index)).toFixed(
    index === 0 ? 0 : 1
  )} ${units[index]}`;
}

export default function FileUploader({
  folderId = null,
  onUploaded,
}) {
  const inputRef = useRef(null);
  const busyRef = useRef(false);

  const [uploads, setUploads] = useState([]);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  function updateUpload(id, changes) {
    setUploads((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, ...changes }
          : item
      )
    );
  }

  async function processFiles(fileList) {
    if (busyRef.current) return;

    const selectedFiles = Array.from(fileList || []);

    if (selectedFiles.length === 0) return;

    busyRef.current = true;
    setBusy(true);

    const batch = selectedFiles.map((file, index) => ({
      id: `${Date.now()}-${index}-${file.name}`,
      file,
      status: 'queued',
      progress: 0,
      error: '',
    }));

    setUploads((current) => [...batch, ...current]);

    let uploadedAny = false;

    try {
      for (const item of batch) {
        const { file } = item;

        if (file.size > MAX_UPLOAD_SIZE) {
          updateUpload(item.id, {
            status: 'error',
            error: 'Maximum supported size is 1 GB.',
          });

          continue;
        }

        updateUpload(item.id, {
          status: 'uploading',
          progress: 0,
          error: '',
        });

        try {
          const progressHandler = (percent) => {
            updateUpload(item.id, {
              progress: Math.min(
                100,
                Math.max(0, percent)
              ),
            });
          };

          if (file.size <= NORMAL_UPLOAD_LIMIT) {
            await uploadRegularFile(
              file,
              folderId,
              progressHandler
            );
          } else {
            await uploadChunkedFile(
              file,
              folderId,
              progressHandler
            );
          }

          uploadedAny = true;

          updateUpload(item.id, {
            status: 'done',
            progress: 100,
          });
        } catch (error) {
          updateUpload(item.id, {
            status: 'error',
            error: error.message || 'Upload failed.',
          });
        }
      }
    } finally {
      busyRef.current = false;
      setBusy(false);

      if (uploadedAny && onUploaded) {
        onUploaded();
      }
    }
  }

  function handleInputChange(event) {
    const files = event.target.files;

    processFiles(files);

    // Allow selecting the same file again for resume.
    event.target.value = '';
  }

  function handleDragOver(event) {
    event.preventDefault();

    if (!busy) {
      setDragging(true);
    }
  }

  function handleDragLeave(event) {
    event.preventDefault();
    setDragging(false);
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);

    if (!busy) {
      processFiles(event.dataTransfer.files);
    }
  }

  function openFilePicker() {
    if (!busy) {
      inputRef.current?.click();
    }
  }

  return (
    <section className="upload-panel">

      <div className="upload-panel-heading">

        <div>
          <h2>Upload files</h2>

          <p>
            Add files to your cloud workspace.
          </p>
        </div>

        <button
          type="button"
          className="upload-select-button"
          onClick={openFilePicker}
          disabled={busy}
        >
          + Choose files
        </button>

      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        onChange={handleInputChange}
      />

      <div
        className={`upload-dropzone ${
          dragging ? 'is-dragging' : ''
        } ${busy ? 'is-busy' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFilePicker}
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label="Choose files or drop files here"
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openFilePicker();
          }
        }}
      >

        <div className="upload-cloud-icon">
          ☁
        </div>

        <strong>
          {dragging
            ? 'Drop files here'
            : 'Drag and drop your files here'}
        </strong>

        <span>
          or click to browse your computer
        </span>

        <small>
          Files up to 50 MB use regular upload.
          Larger files use resumable 5 MB chunks.
          Maximum 1 GB.
        </small>

      </div>

      {uploads.length > 0 && (
        <div className="upload-list">

          <div className="upload-list-heading">
            <h3>Upload activity</h3>
            <span>{uploads.length} files</span>
          </div>

          {uploads.map((item) => (
            <div className="upload-item" key={item.id}>

              <div className="upload-item-top">

                <div className="upload-file-icon">
                  📄
                </div>

                <div className="upload-file-info">
                  <strong>{item.file.name}</strong>

                  <span>
                    {formatBytes(item.file.size)}
                    {' · '}
                    {item.file.size > NORMAL_UPLOAD_LIMIT
                      ? 'Chunked upload'
                      : 'Standard upload'}
                  </span>
                </div>

                <div
                  className={`upload-status ${item.status}`}
                >
                  {item.status === 'queued' && 'Queued'}
                  {item.status === 'uploading' && 'Uploading'}
                  {item.status === 'done' && 'Completed'}
                  {item.status === 'error' && 'Failed'}
                </div>

              </div>

              <div className="upload-progress-track">

                <div
                  className={`upload-progress-fill ${item.status}`}
                  style={{
                    width: `${item.progress}%`,
                  }}
                />

              </div>

              <div className="upload-item-bottom">

                <span>
                  {item.status === 'error'
                    ? item.error
                    : item.status === 'done'
                      ? 'File uploaded successfully.'
                      : `${Math.round(item.progress)}%`}
                </span>

                <span>
                  {item.progress.toFixed(0)}%
                </span>

              </div>

              {item.status === 'error' &&
                item.file.size > NORMAL_UPLOAD_LIMIT && (
                  <p className="upload-resume-hint">
                    Select the same file again to resume
                    from chunks already received by the server.
                  </p>
                )}

            </div>
          ))}

        </div>
      )}

    </section>
  );
}