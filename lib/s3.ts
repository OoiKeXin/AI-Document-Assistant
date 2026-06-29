// lib/s3.ts
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
})

// upload a file buffer directly to S3
export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
) {
  await s3.send(new PutObjectCommand({
    Bucket:      process.env.AWS_BUCKET_NAME!,
    Key:         key,
    Body:        body,
    ContentType: contentType,
  }))
  return key
}

// generate a temporary URL to view/download a file
export async function getPresignedUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME!,
    Key:    key,
  })
  return getSignedUrl(s3, command, { expiresIn: 3600 }) // 1 hour
}