import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const s3Client = new S3Client({ region: process.env.AWS_REGION });

export const uploadFileToBucket = async (
  fileBuffer,
  originalName,
  mimeType
) => {
  const fileExtension = path.extname(originalName);
  const key = `uploads/${uuidv4()}${fileExtension}`;

  const params = {
    Bucket: process.env.AWS_S3_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  };

  try {
    await s3Client.send(new PutObjectCommand(params));

    const fileUrl = `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
    return fileUrl;
  } catch (error) {
    console.error("Error uploading file to S3:", error);
    throw error;
  }
};
