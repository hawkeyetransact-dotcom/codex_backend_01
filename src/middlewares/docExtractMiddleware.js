import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
    if (file.mimetype === "application/pdf" || file.mimetype.startsWith("image/")) {
        cb(null, true);
    } else {
        cb(new Error("Only PDFs and Images are allowed"), false);
    }
};

const docExtractUpload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export default docExtractUpload;
