const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist
const imagesDir = path.join(__dirname, '..', 'uploads', 'images');
const filesDir = path.join(__dirname, '..', 'uploads', 'files');
fs.mkdirSync(imagesDir, { recursive: true });
fs.mkdirSync(filesDir, { recursive: true });

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.mimetype.startsWith('image')) {
            cb(null, imagesDir);
        } else {
            cb(null, filesDir);
        }
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    // Allow images and common file types
    const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'application/zip',
        'application/x-rar-compressed'
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('File type not allowed'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

module.exports = upload;
