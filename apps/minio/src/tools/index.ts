import type { AgentApp } from '@agentapps/sdk';
import { registerBucketExistsTool } from './bucket-exists.js';
import { registerCopyObjectTool } from './copy-object.js';
import { registerCreateBucketTool } from './create-bucket.js';
import { registerDeleteBucketTool } from './delete-bucket.js';
import { registerDeleteObjectTool } from './delete-object.js';
import { registerDownloadObjectTool } from './download-object.js';
import { registerGetObjectInfoTool } from './get-object-info.js';
import { registerGetPresignedUrlTool } from './get-presigned-url.js';
import { registerListBucketsTool } from './list-buckets.js';
import { registerListObjectsTool } from './list-objects.js';
import { registerUploadObjectTool } from './upload-object.js';

export function registerTools(app: AgentApp): void {
  registerListBucketsTool(app);
  registerCreateBucketTool(app);
  registerDeleteBucketTool(app);
  registerBucketExistsTool(app);
  registerListObjectsTool(app);
  registerUploadObjectTool(app);
  registerDownloadObjectTool(app);
  registerDeleteObjectTool(app);
  registerCopyObjectTool(app);
  registerGetPresignedUrlTool(app);
  registerGetObjectInfoTool(app);
}
