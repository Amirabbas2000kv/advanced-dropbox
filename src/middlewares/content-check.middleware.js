const fs = require('fs');
const { inspectFile, resolveMime } = require('../utils/fileType');
const logger = require('../utils/logger');

// Runs AFTER multer saved the file. Looks at the real content and removes bad files.
module.exports = async (req, res, next) => {
  if (!req.file) return next(); // the controller answers "no file uploaded"

  try {
    const result = await inspectFile(req.file.path, req.file.originalname);

    if (!result.ok) {
      fs.unlink(req.file.path, () => {});
      logger.warn(`Rejected upload "${req.file.originalname}" (user ${req.user.id}): ${result.reason}`);
      return res.status(415).json({ error: result.reason });
    }

    req.file.mimetype = resolveMime(result, req.file.mimetype);
    return next();
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    return next(err);
  }
};