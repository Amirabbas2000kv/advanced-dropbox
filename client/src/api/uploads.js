import { apiRequest, getStoredToken } from './http';

export const NORMAL_UPLOAD_LIMIT = 50 * 1024 * 1024;
export const MAX_UPLOAD_SIZE = 1024 * 1024 * 1024;

const PENDING_KEY = 'advanced-dropbox-pending-uploads';

function readPendingUploads() {
  try {
    const value = JSON.parse(
      localStorage.getItem(PENDING_KEY) || '[]'
    );

    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function savePendingUpload(session) {
  try {
    const sessions = readPendingUploads().filter(
      (item) => item.uploadId !== session.uploadId
    );

    sessions.push(session);

    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(sessions)
    );
  } catch (error) {
    console.warn('Could not save upload session:', error);
  }
}

function removePendingUpload(uploadId) {
  try {
    const sessions = readPendingUploads().filter(
      (item) => item.uploadId !== uploadId
    );

    localStorage.setItem(
      PENDING_KEY,
      JSON.stringify(sessions)
    );
  } catch (error) {
    console.warn('Could not remove upload session:', error);
  }
}

function findPendingUpload(file, folderId) {
  return readPendingUploads().find((item) => {
    return (
      item.fileName === file.name &&
      item.fileSize === file.size &&
      item.lastModified === file.lastModified &&
      (item.folderId ?? null) === (folderId ?? null)
    );
  }) || null;
}

function parseResponse(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}

function xhrRequest({
  url,
  method,
  body,
  contentType,
  onProgress,
}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open(method, url, true);

    const token = getStoredToken();

    if (token) {
      xhr.setRequestHeader(
        'Authorization',
        `Bearer ${token}`
      );
    }

    if (contentType) {
      xhr.setRequestHeader('Content-Type', contentType);
    }

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded, event.total);
      }
    });

    xhr.onload = () => {
      const data = parseResponse(xhr.responseText);

      if (xhr.status === 401) {
        window.dispatchEvent(
          new Event('auth:unauthorized')
        );
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        const error = new Error(
          data?.error ||
          data?.message ||
          `Upload failed with status ${xhr.status}`
        );

        error.status = xhr.status;
        error.data = data;

        reject(error);
        return;
      }

      resolve(data);
    };

    xhr.onerror = () => {
      reject(new Error('Network error during file upload.'));
    };

    xhr.onabort = () => {
      reject(new Error('Upload was interrupted.'));
    };

    xhr.send(body);
  });
}

// Normal multipart upload: maximum 50 MB.
export function uploadRegularFile(file, folderId, onProgress) {
  const formData = new FormData();

  // IMPORTANT: file must come before folderId.
  formData.append('file', file, file.name);

  if (folderId !== null && folderId !== undefined) {
    formData.append('folderId', String(folderId));
  }

  return xhrRequest({
    url: '/api/files/upload',
    method: 'POST',
    body: formData,
    onProgress,
  });
}

// Resumable chunked upload: maximum 1 GB.
export async function uploadChunkedFile(
  file,
  folderId,
  onProgress
) {
  if (file.size > MAX_UPLOAD_SIZE) {
    throw new Error('Maximum supported file size is 1 GB.');
  }

  let session = findPendingUpload(file, folderId);
  let status = null;

  // Try to restore an existing upload session.
  if (session) {
    try {
      status = await apiRequest(
        `/uploads/${encodeURIComponent(session.uploadId)}`
      );
    } catch (error) {
      if (error.status === 404) {
        removePendingUpload(session.uploadId);
        session = null;
      } else {
        throw error;
      }
    }
  }

  // Create a new session when none exists.
  if (!session) {
    const initialized = await apiRequest('/uploads/init', {
      method: 'POST',
      body: JSON.stringify({
        fileName: file.name,
        totalSize: file.size,
        mimeType: file.type || 'application/octet-stream',
        folderId: folderId ?? null,
      }),
    });

    session = {
      uploadId: initialized.uploadId,
      fileName: file.name,
      fileSize: file.size,
      lastModified: file.lastModified,
      folderId: folderId ?? null,
      chunkSize: initialized.chunkSize,
      totalChunks: initialized.totalChunks,
    };

    savePendingUpload(session);

    status = await apiRequest(
      `/uploads/${encodeURIComponent(session.uploadId)}`
    );
  }

  if (
    status.totalChunks !== session.totalChunks ||
    !Array.isArray(status.received)
  ) {
    throw new Error('Invalid upload session status.');
  }

  const received = new Set(
    status.received.filter(
      (index) =>
        Number.isInteger(index) &&
        index >= 0 &&
        index < session.totalChunks
    )
  );

  function chunkLength(index) {
    const start = index * session.chunkSize;

    return Math.min(
      session.chunkSize,
      file.size - start
    );
  }

  // Calculate progress from chunks already on the server.
  let completedBytes = 0;

  for (const index of received) {
    completedBytes += chunkLength(index);
  }

  if (onProgress) {
    onProgress((completedBytes / file.size) * 100);
  }

  // Upload only missing chunks, one at a time.
  for (let index = 0; index < session.totalChunks; index++) {
    if (received.has(index)) {
      continue;
    }

    const start = index * session.chunkSize;
    const end = Math.min(
      start + session.chunkSize,
      file.size
    );

    const chunk = file.slice(start, end);

    await xhrRequest({
      url: `/api/uploads/${encodeURIComponent(session.uploadId)}/chunks/${index}`,
      method: 'PUT',
      body: chunk,
      contentType: 'application/octet-stream',
      onProgress: (loaded) => {
        if (onProgress) {
          onProgress(
            ((completedBytes + loaded) / file.size) * 100
          );
        }
      },
    });

    completedBytes += chunk.size;

    if (onProgress) {
      onProgress((completedBytes / file.size) * 100);
    }
  }

  // Ask the backend to merge and validate all chunks.
  const result = await apiRequest(
    `/uploads/${encodeURIComponent(session.uploadId)}/complete`,
    {
      method: 'POST',
    }
  );

  removePendingUpload(session.uploadId);

  if (onProgress) {
    onProgress(100);
  }

  return result;
}