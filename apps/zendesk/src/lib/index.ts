export {
  type ClassifiedZendeskError,
  classifyZendeskError,
  extractZendeskMessage,
  ZendeskApiError,
  type ZendeskIssueAction,
  type ZendeskIssueCode,
} from './_zendesk-error.js';
export {
  type SecretsContext,
  validateCredentials,
  type ZendeskRequestOptions,
  zendeskRequest,
} from './zendesk-client.js';
