# Netlify

Lets an agent publish a static site (HTML, CSS, JavaScript) from a directory of the workspace to
Netlify and get its public URL back. It uses the Netlify REST API
(`https://api.netlify.com/api/v1`) with a personal access token and the file-digest deploy flow:
the app sends a SHA1 of every file and uploads only the files Netlify does not have yet. It does
not run a build, and it does not manage domains, forms or functions.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-sites` | Lists the sites the token can reach, with their ids and URLs. | no |
| `deploy-site` | Deploys a workspace directory to an existing site or a new one, waits until the deploy is ready and returns its URL. With `draft` it makes a preview deploy instead of publishing. | yes, asks first |
| `get-deploy-status` | Returns the state and URL of a deploy. | no |

Limits:

- **Everything under the deployed directory becomes public.** Never deploy a directory that
  holds secrets or private files.
- The directory must be inside the workspace (`/workspace`, or the path in `MCA_WORKSPACE_PATH`)
  and must contain an `index.html`. A path or a symbolic link that leaves the workspace is
  refused. The workspace root itself is refused unless the call sets `allowWorkspaceRoot`.
- `.git`, `node_modules` and `.DS_Store` are never deployed.
- At most 2000 files, 25 MB per file and 100 MB in total.
- `deploy-site` waits up to 5 minutes for the deploy to be ready.

## Setup

```bash
agentapps install app.netlify netlify
agentapps config netlify NETLIFY_TOKEN:<your token>
agentapps netlify tools
agentapps netlify tool list-sites
agentapps netlify tool get-deploy-status siteId:<site id> deployId:<deploy id>
```

`NETLIFY_TOKEN` is an installation secret: each installation uses its own user's token. Create a
personal access token in Netlify under User settings > Applications > Personal access tokens. The
app can deploy to every site that user can reach.

## Terms of use

Netlify's own terms apply to every site the app deploys on your behalf: the subscription
agreement at <https://www.netlify.com/legal/self-serve-subscription-agreement/> and the terms of
use at <https://www.netlify.com/legal/terms-of-use/>. TODO: note here the plan limits that matter
to someone installing the app; none was checked for this README.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | `logo-netlify-monogram-lightmode.svg` in <https://www.netlify.com/assets/logos/netlify-logo-monogram.zip>, linked from <https://www.netlify.com/about/#press> | none |
| assets/logo-mono.svg | same kit, `logo-netlify-monogram-black.svg` | colour replaced by `currentColor` so a host can tint it |

The kit matches the site's icon. Its page asks not to modify the files.
