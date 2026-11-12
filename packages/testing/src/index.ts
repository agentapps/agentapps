/**
 * @agentapps/testing — test harness for app developers.
 *
 * Provides:
 * - `createTestHarness()` — spin up app station + host + app in one call.
 * - `runConformanceTests()` — pre-built AC-8 conformance suite.
 * - `waitForMessage()`, `mockRequest()`, `simulateDisconnect()` — helpers.
 * - `toContainMessage()`, `toHaveMessageSequence()` — traffic assertions.
 */

export { PROTOCOL_VERSION } from '@agentapps/protocol';
export {
  type TrafficFilter,
  toContainMessage,
  toHaveMessageSequence,
} from './assertions.js';
export { runConformanceTests } from './conformance.js';
export { createTestHarness, type TestHarness, type TestHarnessOptions } from './harness.js';
export {
  type MockRequestHandler,
  mockRequest,
  simulateDisconnect,
  waitForMessage,
} from './helpers.js';
