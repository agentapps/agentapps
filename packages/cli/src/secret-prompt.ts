/**
 * @agentapps/cli — asking for a secret on the terminal, without echoing it.
 */

/** @spec SETUP-REQ-5 */
export async function promptSecrets(
  keys: string[],
  input?: NodeJS.ReadableStream,
  output?: NodeJS.WritableStream,
): Promise<Record<string, string>> {
  const stdin = input ?? process.stdin;
  const stdout = output ?? process.stdout;
  const result: Record<string, string> = {};

  for (const key of keys) {
    const value = await promptSecret(stdin, stdout, key);
    if (value) result[key] = value;
  }

  return result;
}

interface TtyLikeReadable extends NodeJS.ReadableStream {
  isTTY?: boolean;
  setRawMode(mode: boolean): void;
  resume(): this;
  setEncoding(encoding: string): this;
  on(event: 'data', listener: (data: Buffer) => void): this;
  off(event: 'data', listener: (data: Buffer) => void): this;
}

interface TtyLikeWritable extends NodeJS.WritableStream {
  isTTY?: boolean;
}

/** @spec CLIENT-REQ-8 */
export function promptSecret(
  stdin: NodeJS.ReadableStream,
  stdout: NodeJS.WritableStream,
  key: string,
): Promise<string> {
  return new Promise((resolve) => {
    const stdinTty = stdin as TtyLikeReadable;
    const stdoutTty = stdout as TtyLikeWritable;
    const isTTY = stdinTty.isTTY && stdoutTty.isTTY;

    stdout.write(`Enter ${key}: `);

    if (!isTTY) {
      readlineFor(stdin, stdout).then((rl) => {
        rl.question('', (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });
      return;
    }

    stdinTty.setRawMode(true);
    stdinTty.resume();
    stdinTty.setEncoding('utf8');

    let value = '';
    const onData = (data: Buffer) => {
      const str = data.toString('utf8');
      for (const ch of str) {
        if (ch === '\n' || ch === '\r') {
          stdinTty.off('data', onData);
          stdinTty.setRawMode(false);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          stdinTty.off('data', onData);
          stdinTty.setRawMode(false);
          stdout.write('\n');
          process.exit(130);
        }
        if (ch === '\u007f') {
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        value += ch;
        stdout.write('*');
      }
    };
    stdinTty.on('data', onData);
  });
}

async function readlineFor(
  input: NodeJS.ReadableStream,
  output: NodeJS.WritableStream,
): Promise<import('node:readline').Interface> {
  // Dynamic import avoids loading readline at module init when it is not needed.
  const { createInterface } = await import('node:readline');
  return createInterface({ input, output });
}
