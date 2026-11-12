export {
  type AcRequestOptions,
  acPing,
  acRequest,
  type SecretsContext,
} from './activecampaign-client.js';
export {
  ActiveCampaignAuthError,
  ActiveCampaignBadRequestError,
  ActiveCampaignError,
  type ActiveCampaignErrorCode,
  ActiveCampaignNotFoundError,
  ActiveCampaignRateLimitError,
  classifyAcError,
  extractAcErrorMessage,
} from './errors.js';
