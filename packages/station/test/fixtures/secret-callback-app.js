/**
 * Fixture app that exercises the SecretsManager request path.
 *
 * When it receives list_tools it requests system and installation secrets. Once the
 * secrets are returned, it answers the pending list_tools with a tool list
 * whose only tool name encodes the resolved secrets, making it easy for tests
 * to assert the request was answered.
 */
import { createInterface } from 'node:readline';

const rl = createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

let systemSecrets = null;
let installationSecrets = null;
let pendingListTools = null;

function send(msg) {
  console.log(JSON.stringify(msg));
}

function requestSecrets() {
  send({
    id: 'req_system',
    type: 'get_system_secrets',
    sessionId: 'secret_session',
    requestId: 'req_system',
    timestamp: new Date().toISOString(),
    version: '2.0',
  });
  send({
    id: 'req_user',
    type: 'get_installation_secrets',
    sessionId: 'secret_session',
    requestId: 'req_user',
    timestamp: new Date().toISOString(),
    version: '2.0',
  });
}

function answerListTools(msg) {
  const parts = [
    systemSecrets?.SYSTEM_VALUE ?? 'no-system',
    installationSecrets?.USER_VALUE ?? 'no-user',
  ];
  send({
    id: msg.id,
    type: 'tools_list',
    timestamp: new Date().toISOString(),
    version: '2.0',
    sessionId: msg.sessionId,
    tools: [
      {
        name: `secrets:${parts.join('-')}`,
        description: 'Echo resolved secrets',
        parameters: { type: 'object', properties: {} },
      },
    ],
  });
}

rl.on('line', (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.type === 'system_secrets') {
      systemSecrets = msg.secrets;
      if (pendingListTools && installationSecrets !== null) {
        answerListTools(pendingListTools);
        pendingListTools = null;
      }
    } else if (msg.type === 'installation_secrets') {
      installationSecrets = msg.secrets;
      if (pendingListTools && systemSecrets !== null) {
        answerListTools(pendingListTools);
        pendingListTools = null;
      }
    } else if (msg.type === 'list_tools') {
      if (systemSecrets !== null && installationSecrets !== null) {
        answerListTools(msg);
      } else {
        pendingListTools = msg;
        requestSecrets();
      }
    } else if (msg.type === 'shutdown') {
      rl.close();
      process.exit(0);
    }
  } catch (err) {
    console.error('Parse error:', err);
  }
});
