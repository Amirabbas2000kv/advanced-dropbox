import { apiRequest } from './http';

export function getFolderContents(folderId = null) {
  const path =
    folderId === null
      ? '/folders'
      : `/folders/${encodeURIComponent(folderId)}`;

  return apiRequest(path);
}

export function getStorageUsage() {
  return apiRequest('/files/storage');
}