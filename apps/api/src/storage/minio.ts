import { Client } from "minio";
import type { StorageProvider } from "@hrms/core";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing-env:${name}`);
  return v;
}

export function createStorage(): StorageProvider {
  const client = new Client({
    endPoint: process.env.STORAGE_ENDPOINT ?? "localhost",
    port: Number(process.env.STORAGE_PORT ?? 9000),
    useSSL: (process.env.STORAGE_USE_SSL ?? "false") === "true",
    accessKey: required("STORAGE_ACCESS_KEY"),
    secretKey: required("STORAGE_SECRET_KEY"),
  });
  const bucket = process.env.STORAGE_BUCKET ?? "hrms-docs";

  async function ensureBucket(): Promise<void> {
    const exists = await client.bucketExists(bucket).catch(() => false);
    if (!exists) await client.makeBucket(bucket);
  }

  return {
    async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
      await ensureBucket();
      await client.putObject(bucket, key, body, body.length, { "Content-Type": contentType });
    },
    async getObject(key: string): Promise<Buffer> {
      const stream = await client.getObject(bucket, key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) chunks.push(Buffer.from(chunk));
      return Buffer.concat(chunks);
    },
    async presignedGet(key: string, expiresSeconds: number): Promise<string> {
      return client.presignedGetObject(bucket, key, expiresSeconds);
    },
  };
}
