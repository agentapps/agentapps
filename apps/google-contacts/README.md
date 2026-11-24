# Google Contacts

Lets an agent work with a Google account's contacts: list, search, read, create, update and
delete contacts, and manage contact groups (labels) and their members. It calls the Google
People API v1 at `https://people.googleapis.com/v1` with the OAuth token of the connected
account.

Limits:

- `list-contacts` and `list-contact-groups` return 100 items per page by default and 1000 at
  most. `search-contacts` returns at most 30 results.
- `delete-contact` is permanent. `delete-contact-group` keeps the group's contacts unless
  `deleteContacts` is `true`.
- `update-contact` sets the name, email, phone, organization and title it is given; it reads
  the contact first to get its current version.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-contacts` | Lists contacts with name, emails and phone numbers, with paging. | no |
| `get-contact` | Returns one contact by resource name, with all its details. | no |
| `search-contacts` | Searches contacts by name, email, phone and other fields. | no |
| `create-contact` | Creates a contact. | yes, asks first |
| `update-contact` | Changes a contact's name, email, phone, organization or title. | yes, asks first |
| `delete-contact` | Deletes a contact permanently. | yes, asks first |
| `list-contact-groups` | Lists contact groups with their member counts. | no |
| `get-contact-group` | Returns one group and its members. | no |
| `create-contact-group` | Creates a contact group. | yes, asks first |
| `update-contact-group` | Renames a contact group. | yes, asks first |
| `delete-contact-group` | Deletes a contact group, and its contacts if asked. | yes, asks first |
| `add-contacts-to-group` | Adds contacts to a group. | yes, asks first |
| `remove-contacts-from-group` | Removes contacts from a group. | yes, asks first |

Contacts are named by resource name, such as `people/c123456789`, and groups as
`contactGroups/abc123`. The list and search tools return them.

## Setup

In a Google Cloud project, enable the **People API**. Create an OAuth client of type *Web
application* (<https://console.cloud.google.com/apis/credentials>) with the redirect URI the
Station uses, `{station URL}/auth/callback`, and add these scopes to the consent screen:
`https://www.googleapis.com/auth/contacts`,
`https://www.googleapis.com/auth/contacts.readonly` and
`https://www.googleapis.com/auth/userinfo.email`.

```bash
agentapps install app.google.contacts contacts
agentapps config app.google.contacts CLIENT_ID:<client id> CLIENT_SECRET:<client secret>
agentapps contacts auth
agentapps contacts tools
agentapps contacts tool search-contacts query:Alice
```

`CLIENT_ID` and `CLIENT_SECRET` are system secrets: one OAuth client for every installation of
the app. `agentapps contacts auth` signs one installation in and stores its `ACCESS_TOKEN` and
`REFRESH_TOKEN`.

## Terms of use

Google's own terms apply to everything the app does on your behalf: the Google APIs Terms of
Service at <https://developers.google.com/terms>, the People API Terms and Conditions at
<https://developers.google.com/people/terms> and the Google API Services User Data Policy at
<https://developers.google.com/terms/api-services-user-data-policy>.

## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | <https://www.gstatic.com/images/branding/productlogos/contacts_2026/v1/192px.svg>, Google's product-logo host. The address was found by its pattern, not from a link on a Google page; the design matches the one <https://about.google/products/> shows | none |
| assets/logo-mono.svg | the same file | the figure in front (its two shapes and the area of the embedded image) at full opacity, and the figure behind at `fill-opacity` 0.55, cut where the front one covers it (paper.js) |
