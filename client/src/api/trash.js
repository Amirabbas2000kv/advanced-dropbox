import { apiRequest } from './http';

function validateFileId(id) {
  const fileId = Number(id);

  if (!Number.isSafeInteger(fileId) || fileId <= 0) {
    throw new Error('Invalid file ID.');
  }

  return fileId;
}

// Get all files currently in Trash.
export async function getTrashFiles() {
  const data = await apiRequest('/files/trash');

  return {
    count: data.count,
    files: Array.isArray(data.files) ? data.files : [],
  };
}

// Restore a file from Trash.
export function restoreTrashedFile(id) {
  const fileId = validateFileId(id);

  return apiRequest(`/files/${fileId}/restore`, {
    method: 'POST',
  });
}

// Permanently delete a file from Trash.
export function permanentlyDeleteTrashedFile(id) {
  const fileId = validateFileId(id);

  return apiRequest(`/files/${fileId}/permanent`, {
    method: 'DELETE',
  });
}