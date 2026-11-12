/**
 * MinIO client factory.
 *
 * Reads ENDPOINT, ACCESS_KEY, SECRET_KEY from system secrets via the SDK
 * context on each call, then creates (or reuses) a MinIO.Client.
 *
 * Endpoint parsing handles http:// / https:// prefixes and optional ports.
 */

import * as Minio from 'minio';
import { MinioApiError } from './_minio-error.js';

export interface SecretsContext {
  secrets: {
    getSystem: () => Promise<Record<string, string> | null>;
    getInstallation: () => Promise<Record<string, string> | null>;
  };
}

interface MinioConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
}

function parseEndpoint(raw: string): { host: string; port: number; useSSL: boolean } {
  let host = raw;
  let port = 9000;
  let useSSL = false;

  if (host.startsWith('https://')) {
    useSSL = true;
    host = host.replace('https://', '');
  } else if (host.startsWith('http://')) {
    host = host.replace('http://', '');
  }

  if (host.includes(':')) {
    const parts = host.split(':');
    host = parts[0];
    port = parseInt(parts[1], 10);
  } else if (useSSL) {
    port = 443;
  }

  return { host, port, useSSL };
}

async function getMinioConfig(ctx: SecretsContext): Promise<MinioConfig> {
  let secrets: Record<string, string> = {};
  try {
    const systemSecrets = await ctx.secrets.getSystem();
    if (systemSecrets) secrets = systemSecrets;
  } catch {
    // fall through to missing-credential error
  }

  const endpoint = secrets.ENDPOINT || secrets.endpoint;
  const accessKey = secrets.ACCESS_KEY || secrets.access_key;
  const secretKey = secrets.SECRET_KEY || secrets.secret_key;

  if (!endpoint) {
    throw new MinioApiError('AUTH_INVALID', 'MinIO endpoint not configured.', {
      type: 'admin_action',
      description: 'Configure ENDPOINT in system secrets.',
    });
  }
  if (!accessKey) {
    throw new MinioApiError('AUTH_INVALID', 'MinIO access key not configured.', {
      type: 'admin_action',
      description: 'Configure ACCESS_KEY in system secrets.',
    });
  }
  if (!secretKey) {
    throw new MinioApiError('AUTH_INVALID', 'MinIO secret key not configured.', {
      type: 'admin_action',
      description: 'Configure SECRET_KEY in system secrets.',
    });
  }

  const { host, port, useSSL } = parseEndpoint(endpoint);
  return { endpoint: host, port, useSSL, accessKey, secretKey };
}

/**
 * Get a configured MinIO client from the SDK context's system secrets.
 */
export async function getMinioClient(ctx: SecretsContext): Promise<Minio.Client> {
  const config = await getMinioConfig(ctx);
  return new Minio.Client({
    endPoint: config.endpoint,
    port: config.port,
    useSSL: config.useSSL,
    accessKey: config.accessKey,
    secretKey: config.secretKey,
  });
}
