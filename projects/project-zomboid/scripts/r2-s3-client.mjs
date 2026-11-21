import { readFile } from "node:fs/promises";
import { S3Client } from "@aws-sdk/client-s3";

const parseEnvironmentFile = (content) => Object.fromEntries(content
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith("#") && line.includes("="))
  .map((line) => {
    const separator = line.indexOf("=");
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    return [key, value];
  }));

export const loadR2Configuration = async () => {
  const fileEnvironment = parseEnvironmentFile(await readFile(".env", "utf8"));
  const getValue = (name) => process.env[name] || fileEnvironment[name] || "";
  const configuration = {
    accountId: getValue("R2_ACCOUNT_ID"),
    accessKeyId: getValue("R2_ACCESS_KEY_ID"),
    secretAccessKey: getValue("R2_SECRET_ACCESS_KEY"),
    bucket: getValue("R2_BUCKET"),
    endpoint: getValue("R2_ENDPOINT"),
  };
  const missing = Object.entries(configuration).filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) throw new Error(`Missing R2 configuration: ${missing.join(", ")}.`);
  return configuration;
};

export const createR2Client = (configuration) => new S3Client({
  region: "auto",
  endpoint: configuration.endpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: configuration.accessKeyId,
    secretAccessKey: configuration.secretAccessKey,
  },
  maxAttempts: 8,
});
