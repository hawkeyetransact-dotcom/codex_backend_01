import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const uploadLocal = async (fileBuffer, originalName) => {
  const fileExtension = path.extname(originalName);
  const fileName = `${uuidv4()}${fileExtension}`;
  const uploadsDir = path.join(process.cwd(), "uploads");
  ensureDir(uploadsDir);
  const filePath = path.join(uploadsDir, fileName);
  await fs.promises.writeFile(filePath, fileBuffer);
  const baseUrl = process.env.UPLOADS_BASE_URL || `http://localhost:${process.env.PORT || 8101}`;
  return `${baseUrl}/uploads/${fileName}`;
};

export const uploadFileToBucket = async (
  fileBuffer,
  originalName,
  mimeType
) => {
  if (process.env.UPLOADS_MODE === "local") {
    return uploadLocal(fileBuffer, originalName);
  }

  const fileExtension = path.extname(originalName);
  const key = `uploads/${uuidv4()}${fileExtension}`;

  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
    ServerSideEncryption: process.env.AWS_KMS_KEY_ID ? "aws:kms" : "AES256",
  };
  if (process.env.AWS_KMS_KEY_ID) {
    params.SSEKMSKeyId = process.env.AWS_KMS_KEY_ID;
  }

  try {
    await s3Client.send(new PutObjectCommand(params));

    const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    return fileUrl;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  }
};
