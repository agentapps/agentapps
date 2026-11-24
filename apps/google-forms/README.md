# Google Forms

Lets an agent create and edit Google Forms and read the responses people submit: create a form,
add, update and delete questions and other items, change the form's title and description, list
and read responses, and set up watches that push notifications to a Cloud Pub/Sub topic. It calls
the Google Forms API through the `googleapis` client with Google OAuth, and uses the Drive API to
list the forms in the account.

Limits: responses are read-only (the app requests `forms.responses.readonly`). A form holds at
most two watches, one per event type.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-forms` | Lists the Google Forms in Drive, with pagination. | no |
| `get-form` | Returns the full structure of a form: items and questions. | no |
| `list-responses` | Lists the responses submitted to a form, with pagination and a timestamp filter. | no |
| `get-response` | Returns one response by id. | no |
| `list-watches` | Lists the watches on a form. | no |
| `create-form` | Creates a form with a title and returns its id and responder URL. | yes, asks first |
| `add-question` | Adds a question item at a given position. | yes, asks first |
| `update-item` | Updates an existing item, using an update mask. | yes, asks first |
| `delete-item` | Deletes an item by its 0-based position. | yes, asks first |
| `update-form-info` | Changes the form's title, description or document title. | yes, asks first |
| `update-form` | Runs raw batch update requests on a form, deletions included. | yes, asks first |
| `create-watch` | Creates a watch that sends form events to a Cloud Pub/Sub topic. | yes, asks first |

Every tool that writes is marked `sensitive`, so hosts ask before running it. `delete-item` and
`update-form` are also `destructiveHint: true`: a deleted item cannot be restored.

## Setup

The app signs in with Google OAuth 2.0. Whoever runs the Station registers one OAuth client;
each user then connects their own Google account.

1. In the Google Cloud console, create or pick a project, enable the Google Forms API and the
   Google Drive API, and create an OAuth client ID of type Web application. Add the redirect URI
   the Station uses: `{station URL}/auth/callback`.
2. Store the client as system secrets, shared by every installation of the app:

```bash
agentapps config app.google.forms CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
```

3. Install the app and connect an account:

```bash
agentapps install app.google.forms forms
agentapps forms auth
agentapps forms tools
agentapps forms tool list-forms pageSize:10
```

The OAuth flow stores the installation secrets `ACCESS_TOKEN` and `REFRESH_TOKEN`; users never
set them by hand.

Scopes requested: `https://www.googleapis.com/auth/forms.body`,
`https://www.googleapis.com/auth/forms.responses.readonly`,
`https://www.googleapis.com/auth/drive.file` and
`https://www.googleapis.com/auth/userinfo.email`.

## Terms of use

Use of the API is governed by the
[Google APIs Terms of Service](https://developers.google.com/terms) and, for the data of the
connected account, the
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).
Google's own quotas for the Forms API apply; this README does not list them.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's brand
resources or its own site). They have been in the repository since before this README existed
and their origin was not written down.
