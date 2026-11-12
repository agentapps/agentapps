# Security Policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Send a report to **pablo@hexagon.sh** with:

- what is affected (package, app or script, with the version or commit),
- how to reproduce it,
- what an attacker could do with it.

You will get an acknowledgement within three working days and a decision on the fix and its timing
within ten. We will credit you in the release notes unless you prefer otherwise.

## Scope

This repository holds the Agent Apps protocol, SDK, Station, Host, CLI and a catalog of apps. Reports
about these are in scope. Problems in the third-party services an app talks to (GitHub, Google, Slack,
and so on) belong to those services.

Secrets are a frequent subject: apps never read credentials from disk and the Station hands them out per
session. If you find a path by which an app, a tool result or a log exposes a secret, that is in scope.

## Supported versions

Until the first tagged release, only `main` is supported. From then on, the latest release.

## Disclosure

We fix first and publish after. A secret found in the repository is rotated before the fix is published;
public history is never rewritten.
