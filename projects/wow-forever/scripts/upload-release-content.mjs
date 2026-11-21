import { readFile } from "node:fs/promises";
import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const contentTypes = {
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

export function releaseContentBaseUrl(value, fingerprint) {
  if (!value) throw new Error("R2_PUBLIC_ORIGIN is required for a CDN release.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("R2_PUBLIC_ORIGIN must be an HTTPS origin without a path.");
  }
  return `${url.origin}/releases/${fingerprint}`;
}

export async function verifyReleaseContent(plan, publicOrigin) {
  const baseUrl = releaseContentBaseUrl(publicOrigin, plan.fingerprint);
  const publishCommand = "node scripts/build-opk.mjs --upload-content";
  let response;
  try {
    response = await fetch(`${baseUrl}/release-manifest.json`);
  } catch (error) {
    throw new Error(`Cannot reach R2 release at ${baseUrl}. Publish it with ${publishCommand}.`, { cause: error });
  }
  if (!response.ok) {
    throw new Error(`R2 release is unavailable at ${baseUrl} (HTTP ${response.status}). Publish it with ${publishCommand}.`);
  }
  let published;
  try {
    published = await response.json();
  } catch (error) {
    throw new Error(`R2 release manifest is invalid at ${baseUrl}. Publish it with ${publishCommand}.`, { cause: error });
  }
  const expectedFiles = plan.files.map(({ path, size, sha256 }) => ({ path, size, sha256 }));
  if (published.fingerprint !== plan.fingerprint || JSON.stringify(published.files) !== JSON.stringify(expectedFiles)) {
    throw new Error(`R2 release content differs from this build at ${baseUrl}. Publish it with ${publishCommand}.`);
  }
  return baseUrl;
}

async function listReleaseObjects(client, bucket, prefix) {
  const objects = new Map();
  let continuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `${prefix}/`,
      ContinuationToken: continuationToken,
    }));
    for (const object of page.Contents ?? []) objects.set(object.Key, object.Size);
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return objects;
}

export async function uploadReleaseContent(plan, env) {
  const bucket = env.R2_BUCKET?.trim();
  const accountId = env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY?.trim();
  const baseUrl = releaseContentBaseUrl(env.R2_PUBLIC_ORIGIN?.trim(), plan.fingerprint);
  if (!bucket || !accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required.");
  }
  const endpoint = env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;
  if (new URL(endpoint).protocol !== "https:") throw new Error("R2_ENDPOINT must use HTTPS.");

  const client = new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
  });
  const prefix = `releases/${plan.fingerprint}`;
  const existing = await listReleaseObjects(client, bucket, prefix);
  const pending = plan.files.filter((file) => existing.get(`${prefix}/${file.path}`) !== file.size);
  console.log(`R2 content: ${plan.files.length} files, ${pending.length} to upload.`);

  if (pending.length === 0) {
    try {
      await verifyReleaseContent(plan, env.R2_PUBLIC_ORIGIN?.trim());
      console.log(`R2 content already published at ${baseUrl}`);
      return baseUrl;
    } catch {
      // A previous publish may have uploaded every file but stopped before
      // writing the release manifest. Finish that publish below.
    }
  }

  let nextIndex = 0;
  let completed = 0;
  const worker = async () => {
    while (nextIndex < pending.length) {
      const file = pending[nextIndex++];
      const extension = file.path.slice(file.path.lastIndexOf("."));
      const contentType = contentTypes[extension];
      if (!contentType) throw new Error(`Unknown release content type: ${file.path}`);
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: `${prefix}/${file.path}`,
        Body: await readFile(file.sourcePath),
        ContentLength: file.size,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: { sha256: file.sha256 },
      }));
      completed++;
      if (completed % 250 === 0 || completed === pending.length) {
        console.log(`R2 upload: ${completed}/${pending.length}`);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(16, pending.length) }, worker));
    const uploaded = await listReleaseObjects(client, bucket, prefix);
    const missing = plan.files.filter((file) => uploaded.get(`${prefix}/${file.path}`) !== file.size);
    if (missing.length) throw new Error(`R2 upload verification failed for ${missing.length} files, starting with ${missing[0].path}.`);

    const manifest = {
      version: 1,
      fingerprint: plan.fingerprint,
      files: plan.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
    };
    await client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: `${prefix}/release-manifest.json`,
      Body: JSON.stringify(manifest),
      ContentType: contentTypes[".json"],
      CacheControl: "public, max-age=31536000, immutable",
    }));

    await verifyReleaseContent(plan, env.R2_PUBLIC_ORIGIN?.trim());
    console.log(`R2 content verified at ${baseUrl}`);
    return baseUrl;
  } finally {
    client.destroy();
  }
}
