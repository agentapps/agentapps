export {
  ensureAuthenticated,
  type GoogleClients,
  initializeGoogleClients,
  type SecretsContext,
  withAuthRetry,
} from './google-client.js';

export { extractTextFromSlide, processEscapeSequences } from './helpers.js';
