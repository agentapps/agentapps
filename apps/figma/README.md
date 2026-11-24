# Figma

Lets an agent read Figma design files and work with their comments. Given the file key from a
Figma URL, it returns the file's structure, single nodes,
styles, variables, components and version history, exports nodes as images, and turns colours
and text styles into CSS, Tailwind or JSON. It uses the Figma REST API
(`https://api.figma.com/v1`) with OAuth 2.0, on behalf of the Figma account that connected. It
cannot edit designs: the only things it writes are comments.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `create-comment` | Posts a comment on a file, or a reply to a comment, optionally anchored to a point or a node. | yes, asks first |
| `delete-comment` | Deletes a comment from a file. This cannot be undone. | yes, asks first |
| `export-images` | Returns download URLs for nodes rendered as PNG, JPG, SVG or PDF, at a scale from 0.01 to 4. The URLs expire after about 30 minutes. | no |
| `extract-colors` | Collects the solid fill and stroke colours of a file or of one node, as CSS variables, a Tailwind config or JSON. | no |
| `extract-typography` | Collects the text styles of a file (family, size, weight, line height, letter spacing), as CSS, a Tailwind config or JSON. | no |
| `get-comments` | Lists the comments on a file. | no |
| `get-component-sets` | Lists the component sets (groups of variants) defined in a file. | no |
| `get-components` | Lists the components defined in a file. | no |
| `get-file` | Returns the structure of a file (pages, frames, top-level components) down to a depth of 1 to 10, 2 by default. | no |
| `get-file-styles` | Lists the styles defined in a file. | no |
| `get-file-variables` | Returns the variables (design tokens) of a file, grouped by collection. | no |
| `get-node` | Returns one node as a tree, down to a depth of 1 to 10, 3 by default. Use it to go deeper than `get-file`. | no |
| `list-file-versions` | Lists the version history of a file, 30 per page and up to 50. | no |

Limits:

- The app works on files the connected account can open. It has no tool to list files, projects
  or teams: you give it the file key.
- `get-components`, `get-component-sets`, `get-file-styles`, `extract-colors` and
  `extract-typography` download the whole file each time, which is slow on large files.
- Reads are retried up to three times on a rate limit or a server error. Writes are never
  retried.
- When Figma rejects the access token, the app gets a new one with the refresh token and
  repeats the request once. It does not store the new token.

## Setup

The app uses Figma OAuth 2.0. Whoever runs the Station registers an OAuth app once; each user
then connects their own Figma account.

1. Create an OAuth app in Figma (<https://www.figma.com/developers/apps>) and add the redirect
   URL the Station uses: `{station URL}/auth/callback`. Give it the scopes listed in
   `agentapp.json` under `auth.scopes`.
2. Store its client id and secret as system secrets, shared by every installation:

```bash
agentapps config app.figma CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.figma figma
agentapps figma auth
agentapps figma tools
agentapps figma tool get-file fileKey:<file key> depth:2
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN`, `REFRESH_TOKEN` and
`EXPIRY_DATE` on the installation; nobody sets them by hand.

## Terms of use

Use of the API is governed by the
[Figma Developer Terms](https://www.figma.com/legal/developer-terms/), and Figma's
[Terms of Service](https://www.figma.com/legal/tos/) apply to the account that connects.
Figma limits requests per plan and per endpoint; see
<https://developers.figma.com/docs/rest-api/rate-limits/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Figma's brand
guidelines or its own site). They have been in the repository since before this README existed
and their origin was not written down.
