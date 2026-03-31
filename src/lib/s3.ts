import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET_NAME ?? "dashes-project-files";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

function fileKey(projectId: string, path: string): string {
  return `${projectId}/${path}`;
}

export async function writeFile(
  projectId: string,
  path: string,
  content: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: fileKey(projectId, path),
      Body: content,
      ContentType: getContentType(path),
    })
  );
}

export async function readFile(
  projectId: string,
  path: string
): Promise<string> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: fileKey(projectId, path),
    })
  );
  return (await response.Body?.transformToString("utf-8")) ?? "";
}

export async function deleteFile(
  projectId: string,
  path: string
): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: fileKey(projectId, path),
    })
  );
}

export async function listFiles(projectId: string): Promise<string[]> {
  const prefix = `${projectId}/`;
  const response = await s3.send(
    new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
    })
  );
  return (response.Contents ?? [])
    .map((obj) => obj.Key?.replace(prefix, "") ?? "")
    .filter(Boolean);
}

function getContentType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    ts: "text/typescript",
    tsx: "text/typescript",
    js: "application/javascript",
    jsx: "application/javascript",
    json: "application/json",
    css: "text/css",
    html: "text/html",
    md: "text/markdown",
    svg: "image/svg+xml",
    png: "image/png",
    ico: "image/x-icon",
  };
  return types[ext ?? ""] ?? "text/plain";
}
