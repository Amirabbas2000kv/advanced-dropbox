module.exports = {
  // Max size of ONE file in a normal upload (bytes)
  maxFileSize: 50 * 1024 * 1024, // 50 MB

  // Chunked upload settings
  chunkSize: 5 * 1024 * 1024, // 5 MB per chunk
  maxChunkedFileSize: 1024 * 1024 * 1024, // 1 GB

  // Dangerous extensions that are never accepted
  blockedExtensions: [
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr',
    '.sh', '.ps1', '.vbs', '.jar', '.dll',
  ],
};