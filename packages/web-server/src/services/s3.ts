import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ── Client ──────────────────────────────────────────────────────────

let client: S3Client | null = null;
let bucket: string | null = null;

function getClient(): { client: S3Client; bucket: string } {
  if (!client || !bucket) {
    const endpoint = process.env.S3_ENDPOINT;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const region = process.env.S3_REGION ?? "us-east-1";
    bucket = process.env.S3_BUCKET ?? null;

    if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        "S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_BUCKET env vars are required",
      );
    }

    client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });
  }
  return { client, bucket };
}

// ── Helpers ─────────────────────────────────────────────────────────

export async function uploadFile(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType: string,
): Promise<void> {
  const s3 = getClient();
  await s3.client.send(
    new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteFile(key: string): Promise<void> {
  const s3 = getClient();
  await s3.client.send(
    new DeleteObjectCommand({
      Bucket: s3.bucket,
      Key: key,
    }),
  );
}

export async function downloadFile(key: string): Promise<Buffer> {
  const s3 = getClient();
  const response = await s3.client.send(
    new GetObjectCommand({
      Bucket: s3.bucket,
      Key: key,
    }),
  );
  if (!response.Body) {
    throw new Error(`S3 object ${key} has no body`);
  }
  return Buffer.from(await response.Body.transformToByteArray());
}

export async function getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
  const s3 = getClient();
  return getSignedUrl(
    s3.client,
    new GetObjectCommand({
      Bucket: s3.bucket,
      Key: key,
    }),
    { expiresIn: expiresInSeconds },
  );
}
