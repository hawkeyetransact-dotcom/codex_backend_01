import multer from "multer";

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 🔹 Limit file size to 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" // .xlsx
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only PDF and Excel (.xlsx) files are allowed"), false);
    }

    cb(null, true);
  }
});


export default upload;
