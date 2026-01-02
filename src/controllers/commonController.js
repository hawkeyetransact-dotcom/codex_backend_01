import multer from "multer";
import { uploadFileToBucket } from "../utils/s3Upload.js";
const upload = multer();
export const uploadFile = async (req, res) => {
    
    upload.single("file")(req, res, async (err) => {

        if (err) {
            return res.status(500).json({ message: "Multer error", error: err.message });
        }

        try {
            const file = req.file;
            if (!file) {
            return res.status(400).json({ message: "No file provided" });
            }
            const fileUrl = await uploadFileToBucket(file.buffer, file.originalname, file.mimetype);
            res.status(200).json({ fileUrl });
        } catch (error) {
            res.status(500).json({ message: "Error uploading file", error: error.message });
        }
    }); 
}



