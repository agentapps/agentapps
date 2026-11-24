# Bash

Lets an agent run shell commands on the machine where the app runs. It has one tool, which runs a
command with a working directory and a timeout and returns its output and exit code. It calls no
outside API. A command can do anything the app's process can do, so the tool always asks first.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `bash` | Runs a bash command and returns stdout, stderr, the exit code and the duration. | yes, asks first |

Limits:

- The timeout is 2 minutes by default and 10 minutes at most. A command that runs longer is
  stopped.
- The working directory is the mounted Workspace Volume when there is one, otherwise the app's
  current directory. `cwd` overrides it. The Volume's path is also in the
  `AGENTAPPS_VOLUME_PATH` environment variable.
- Commands are not sandboxed by the app.

## Setup

```bash
agentapps install app.bash bash
agentapps bash tools
agentapps bash tool bash command:pwd "description:Print the working directory"
```

There is nothing to configure. The app has no read-only tool: the example runs `pwd`, which
changes nothing. `command` and `description` are both required.

## Terms of use

The app calls no outside service, so no service's terms apply to it. What a command reaches is
under that service's own terms.

TODO: the manifest's `terms` field points to <https://agentapps.tech/terms>, which answered 404
when this README was written. Link the Agent Apps terms here once the page exists.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg`. They have been
in the repository since before this README existed and their origin was not written down.
