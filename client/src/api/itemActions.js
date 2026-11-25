import { apiRequest } from './http';
import { getFolderContents } from './workspace';

// File operations

export function renameFile(id, name) {
  return apiRequest(`/files/${id}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function moveFile(id, folderId) {
  return apiRequest(`/files/${id}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ folderId }),
  });
}

export function deleteFile(id) {
  return apiRequest(`/files/${id}`, {
    method: 'DELETE',
  });
}

// Folder operations

export function createFolder(name, parentId = null) {
  return apiRequest('/folders', {
    method: 'POST',
    body: JSON.stringify({ name, parentId }),
  });
}

export function renameFolder(id, name) {
  return apiRequest(`/folders/${id}/rename`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function moveFolder(id, parentId) {
  return apiRequest(`/folders/${id}/move`, {
    method: 'PATCH',
    body: JSON.stringify({ parentId }),
  });
}

export function deleteFolder(id) {
  return apiRequest(`/folders/${id}`, {
    method: 'DELETE',
  });
}

// Get destination folders for Move dialog.

export async function getFolderTargets(excludeFolderId = null) {
  const root = await getFolderContents(null);

  let queue = (root.folders || []).map((folder) => ({
    folder,
    path: folder.name,
    depth: 1,
  }));

  const targets = [];

  while (queue.length > 0) {
    const batch = queue.splice(0, 8);

    const results = await Promise.all(
      batch.map(async (entry) => {
        if (
          excludeFolderId !== null &&
          String(entry.folder.id) === String(excludeFolderId)
        ) {
          return {
            entry,
            children: [],
            excluded: true,
          };
        }

        const content = await getFolderContents(entry.folder.id);

        return {
          entry,
          children: content.folders || [],
          excluded: false,
        };
      })
    );

    for (const result of results) {
      if (result.excluded) continue;

      targets.push({
        id: result.entry.folder.id,
        name: result.entry.folder.name,
        path: result.entry.path,
      });

      if (result.entry.depth < 50) {
        for (const child of result.children) {
          queue.push({
            folder: child,
            path: `${result.entry.path} / ${child.name}`,
            depth: result.entry.depth + 1,
          });
        }
      }
    }

    if (targets.length > 2000) {
      throw new Error(
        'Too many folders to display in the move dialog.'
      );
    }
  }

  return targets;
}