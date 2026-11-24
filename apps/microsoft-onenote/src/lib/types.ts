export interface OneNoteSecrets {
  CLIENT_ID?: string;
  CLIENT_SECRET?: string;
  ACCESS_TOKEN?: string;
  REFRESH_TOKEN?: string;
  EMAIL?: string;
  EXPIRY_DATE?: string;
}

export interface GraphError {
  error?: {
    code?: string;
    message?: string;
    innerError?: {
      'request-id'?: string;
      date?: string;
    };
  };
}
