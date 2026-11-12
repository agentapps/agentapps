/**
 * Tests for the lifecycle protocol schemas.
 *
 * Verifies that install/uninstall control-plane messages and
 * session_opened/session_closed session-plane notifications parse
 * correctly and reject invalid inputs.
 */

import { describe, expect, it } from 'vitest';
import {
  InstalledResponseSchema,
  InstallLifecycleErrorResponseSchema,
  InstallLifecycleNotificationSchema,
  InstallLifecycleRequestSchema,
  InstallLifecycleResponseSchema,
  InstallRequestSchema,
  PROTOCOL_VERSION,
  SessionClosedNotificationSchema,
  SessionOpenedNotificationSchema,
  UninstalledResponseSchema,
  UninstallRequestSchema,
} from '../src/index.js';

const baseFields = {
  id: 'msg_test_1',
  timestamp: new Date().toISOString(),
  version: PROTOCOL_VERSION,
};

const sessionBaseFields = {
  ...baseFields,
  sessionId: 'sess_123',
};

describe('lifecycle protocol', () => {
  // -------------------------------------------------------------------------
  // Install request
  // -------------------------------------------------------------------------

  describe('InstallRequestSchema', () => {
    it('parses a valid install request', () => {
      const msg = {
        ...baseFields,
        type: 'install',
        installationId: 'inst_abc',
        tenant: { userId: 'user_1', workspaceId: 'ws_1' },
        host: { name: 'test-host', version: '1.0.0', capabilities: {} },
      };
      const parsed = InstallRequestSchema.parse(msg);
      expect(parsed.type).toBe('install');
      expect(parsed.installationId).toBe('inst_abc');
      expect(parsed.tenant.userId).toBe('user_1');
    });

    it('accepts tenant without workspaceId', () => {
      const msg = {
        ...baseFields,
        type: 'install',
        installationId: 'inst_abc',
        tenant: { userId: 'user_1' },
      };
      const parsed = InstallRequestSchema.parse(msg);
      expect(parsed.tenant.workspaceId).toBeUndefined();
    });

    it('rejects missing installationId', () => {
      const msg = {
        ...baseFields,
        type: 'install',
        tenant: { userId: 'user_1' },
      };
      expect(() => InstallRequestSchema.parse(msg)).toThrow();
    });

    it('rejects missing tenant', () => {
      const msg = {
        ...baseFields,
        type: 'install',
        installationId: 'inst_abc',
      };
      expect(() => InstallRequestSchema.parse(msg)).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Installed response
  // -------------------------------------------------------------------------

  describe('InstalledResponseSchema', () => {
    it('parses a successful installed response', () => {
      const msg = {
        ...baseFields,
        type: 'installed',
        installationId: 'inst_abc',
        success: true,
      };
      const parsed = InstalledResponseSchema.parse(msg);
      expect(parsed.success).toBe(true);
      expect(parsed.error).toBeUndefined();
    });

    it('parses a failed installed response with error', () => {
      const msg = {
        ...baseFields,
        type: 'installed',
        installationId: 'inst_abc',
        success: false,
        error: 'Hook threw an error',
      };
      const parsed = InstalledResponseSchema.parse(msg);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Hook threw an error');
    });

    it('parses an installed response with result data', () => {
      const msg = {
        ...baseFields,
        type: 'installed',
        installationId: 'inst_abc',
        success: true,
        result: { collections: ['settings', 'tasks'] },
      };
      const parsed = InstalledResponseSchema.parse(msg);
      expect(parsed.result).toEqual({ collections: ['settings', 'tasks'] });
    });
  });

  // -------------------------------------------------------------------------
  // Uninstall request / response
  // -------------------------------------------------------------------------

  describe('UninstallRequestSchema', () => {
    it('parses a valid uninstall request', () => {
      const msg = {
        ...baseFields,
        type: 'uninstall',
        installationId: 'inst_abc',
        tenant: { userId: 'user_1' },
      };
      const parsed = UninstallRequestSchema.parse(msg);
      expect(parsed.type).toBe('uninstall');
      expect(parsed.installationId).toBe('inst_abc');
    });
  });

  describe('UninstalledResponseSchema', () => {
    it('parses a successful uninstalled response', () => {
      const msg = {
        ...baseFields,
        type: 'uninstalled',
        installationId: 'inst_abc',
        success: true,
      };
      const parsed = UninstalledResponseSchema.parse(msg);
      expect(parsed.success).toBe(true);
    });

    it('parses a failed uninstalled response', () => {
      const msg = {
        ...baseFields,
        type: 'uninstalled',
        installationId: 'inst_abc',
        success: false,
        error: 'Cleanup failed',
      };
      const parsed = UninstalledResponseSchema.parse(msg);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Cleanup failed');
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle error response
  // -------------------------------------------------------------------------

  describe('InstallLifecycleErrorResponseSchema', () => {
    it('parses an error response', () => {
      const msg = {
        ...baseFields,
        type: 'error',
        error: { code: 'INSTALL_FAILED', message: 'Installation failed' },
      };
      const parsed = InstallLifecycleErrorResponseSchema.parse(msg);
      expect(parsed.error.code).toBe('INSTALL_FAILED');
    });
  });

  // -------------------------------------------------------------------------
  // Union schemas
  // -------------------------------------------------------------------------

  describe('InstallLifecycleRequestSchema', () => {
    it('discriminates install requests', () => {
      const msg = {
        ...baseFields,
        type: 'install',
        installationId: 'inst_1',
        tenant: { userId: 'u1' },
      };
      const parsed = InstallLifecycleRequestSchema.parse(msg);
      expect(parsed.type).toBe('install');
    });

    it('discriminates uninstall requests', () => {
      const msg = {
        ...baseFields,
        type: 'uninstall',
        installationId: 'inst_1',
        tenant: { userId: 'u1' },
      };
      const parsed = InstallLifecycleRequestSchema.parse(msg);
      expect(parsed.type).toBe('uninstall');
    });
  });

  describe('InstallLifecycleResponseSchema', () => {
    it('discriminates installed responses', () => {
      const msg = {
        ...baseFields,
        type: 'installed',
        installationId: 'inst_1',
        success: true,
      };
      const parsed = InstallLifecycleResponseSchema.parse(msg);
      expect(parsed.type).toBe('installed');
    });

    it('discriminates uninstalled responses', () => {
      const msg = {
        ...baseFields,
        type: 'uninstalled',
        installationId: 'inst_1',
        success: true,
      };
      const parsed = InstallLifecycleResponseSchema.parse(msg);
      expect(parsed.type).toBe('uninstalled');
    });
  });

  // -------------------------------------------------------------------------
  // Session-plane notifications
  // -------------------------------------------------------------------------

  describe('SessionOpenedNotificationSchema', () => {
    it('parses a valid session_opened notification', () => {
      const msg = {
        ...sessionBaseFields,
        type: 'session_opened',
        installationId: 'inst_abc',
        tenant: { userId: 'user_1', workspaceId: 'ws_1' },
        host: { name: 'test-host', version: '1.0.0', capabilities: {} },
      };
      const parsed = SessionOpenedNotificationSchema.parse(msg);
      expect(parsed.type).toBe('session_opened');
      expect(parsed.installationId).toBe('inst_abc');
      expect(parsed.tenant.userId).toBe('user_1');
    });

    it('requires sessionId', () => {
      const msg = {
        ...baseFields,
        type: 'session_opened',
        installationId: 'inst_abc',
        tenant: { userId: 'user_1' },
      };
      expect(() => SessionOpenedNotificationSchema.parse(msg)).toThrow();
    });
  });

  describe('SessionClosedNotificationSchema', () => {
    it('parses a valid session_closed notification', () => {
      const msg = {
        ...sessionBaseFields,
        type: 'session_closed',
        reason: 'user_request',
      };
      const parsed = SessionClosedNotificationSchema.parse(msg);
      expect(parsed.type).toBe('session_closed');
      expect(parsed.reason).toBe('user_request');
    });

    it('accepts session_closed without reason', () => {
      const msg = {
        ...sessionBaseFields,
        type: 'session_closed',
      };
      const parsed = SessionClosedNotificationSchema.parse(msg);
      expect(parsed.reason).toBeUndefined();
    });
  });

  describe('InstallLifecycleNotificationSchema', () => {
    it('discriminates session_opened', () => {
      const msg = {
        ...sessionBaseFields,
        type: 'session_opened',
        installationId: 'inst_1',
        tenant: { userId: 'u1' },
        host: { name: 'test-host', version: '1.0.0', capabilities: {} },
      };
      const parsed = InstallLifecycleNotificationSchema.parse(msg);
      expect(parsed.type).toBe('session_opened');
    });

    it('discriminates session_closed', () => {
      const msg = {
        ...sessionBaseFields,
        type: 'session_closed',
      };
      const parsed = InstallLifecycleNotificationSchema.parse(msg);
      expect(parsed.type).toBe('session_closed');
    });
  });
});
