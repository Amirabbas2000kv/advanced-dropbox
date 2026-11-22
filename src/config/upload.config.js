module.exports = {
  // Max size of ONE file (bytes)
  maxFileSize: 50 * 1024 * 1024, // 50 MB

  // Dangerous extensions that are never accepted
  blockedExtensions: [
    '.exe', '.bat', '.cmd', '.com', '.msi', '.scr',
    '.sh', '.ps1', '.vbs', '.jar', '.dll',
  ],
};