# Google Slides

Lets an agent create, read and edit Google Slides presentations: create a presentation, read all
slides or one slide, add, duplicate and delete slides, add text boxes and images, replace text
across the presentation, and run raw batch updates. It calls the Google Slides API through the
`googleapis` client with Google OAuth.

Limits: `add-image` needs an image URL that is publicly reachable. Positions and sizes are in
points. The app cannot delete a whole presentation.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `read-presentation` | Reads the slide content of a presentation. | no |
| `read-slide` | Reads one slide by its index. | no |
| `get-slide` | Returns one slide by its object id: text, page elements and layout. | no |
| `create-presentation` | Creates a presentation with a title and returns its id and URL. | yes, asks first |
| `add-slide` | Adds a slide and returns its object id. | yes, asks first |
| `duplicate-slide` | Copies a slide and inserts the copy after the original. | yes, asks first |
| `delete-slide` | Deletes a slide by its object id or 0-based index. | yes, asks first |
| `add-text-box` | Inserts a text box on a slide, with optional text. | yes, asks first |
| `add-image` | Inserts an image on a slide from a public URL. | yes, asks first |
| `update-slide` | Inserts text into a slide's first text element, or replaces text across the presentation. | yes, asks first |
| `replace-text` | Replaces every occurrence of a text string in the presentation. | yes, asks first |
| `batch-update` | Runs raw Slides API batch update requests. | yes, asks first |

Every tool that writes is marked `sensitive`, so hosts ask before running it. `delete-slide`,
`update-slide`, `replace-text` and `batch-update` are also `destructiveHint: true`.

## Setup

The app signs in with Google OAuth 2.0. Whoever runs the Station registers one OAuth client;
each user then connects their own Google account.

1. In the Google Cloud console, create or pick a project, enable the Google Slides API and create
   an OAuth client ID of type Web application. Add the redirect URI the Station uses:
   `{station URL}/auth/callback`.
2. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.google.slides CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.google.slides slides
agentapps slides auth
agentapps slides tools
agentapps slides tool read-presentation presentationId:<presentation id>
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN` and `REFRESH_TOKEN`; users never
set them by hand.

Scopes requested: `https://www.googleapis.com/auth/presentations`,
`https://www.googleapis.com/auth/presentations.readonly` and
`https://www.googleapis.com/auth/userinfo.email`.

## Terms of use

Use of the API is governed by the
[Google APIs Terms of Service](https://developers.google.com/terms) and, for the data of the
connected account, the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
Google's own quotas for the Slides API apply; this README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's brand
resources or its own site). They have been in the repository since before this README existed
and their origin was not written down.
