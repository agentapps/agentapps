export {
  type ClassifiedMailchimpError,
  classifyMailchimpError,
  extractMailchimpMessage,
  MailchimpApiError,
  type MailchimpIssueAction,
  type MailchimpIssueCode,
} from './_mailchimp-error.js';
export {
  getMailchimpAuth,
  type MailchimpRequestOptions,
  mailchimpRequest,
  type SecretsContext,
} from './mailchimp-client.js';
