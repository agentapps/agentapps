# Trello

Lets an agent manage Trello through the Trello REST API (`https://api.trello.com/1`): boards,
lists, cards, labels and comments, plus a search across boards. It needs two credentials: an
API key shared by every installation, and a token per installation that decides which Trello
user it acts as. Only reads are retried on a rate limit or a server error; a create, update or
delete is never retried, so a failed call may need to be repeated by hand.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `list-boards` | Lists the boards the user can access (open ones by default). | no |
| `create-board` | Creates a board. | yes, asks first |
| `get-board` | Returns one board by id. | no |
| `update-board` | Changes a board's name, description or background. | yes, asks first |
| `delete-board` | Deletes a board permanently. | yes, asks first |
| `list-board-lists` | Lists the lists of a board. | no |
| `create-list` | Creates a list in a board. | yes, asks first |
| `update-list` | Changes a list's name, color or position, or archives it. | yes, asks first |
| `list-cards` | Lists the cards of a list. | no |
| `get-card` | Returns one card by id. | no |
| `create-card` | Creates a card in a list, with optional description, due date and labels. | yes, asks first |
| `update-card` | Changes a card's name, description or due date, moves it to another list or archives it. | yes, asks first |
| `add-comment` | Adds a comment to a card. | yes, asks first |
| `get-card-actions` | Returns a card's activity history. | no |
| `list-labels` | Lists the labels of a board. | no |
| `create-label` | Creates a label on a board. | yes, asks first |
| `add-label-to-card` | Adds a label to a card. | yes, asks first |
| `remove-label-from-card` | Removes a label from a card. | yes, asks first |
| `search` | Searches cards, boards or members across all boards. | no |

## Setup

```bash
agentapps install app.trello trello
agentapps config app.trello TRELLO_API_KEY:<your API key>
agentapps config trello TRELLO_TOKEN:<your token>
agentapps trello tools
agentapps trello tool list-boards filter:open
```

`TRELLO_API_KEY` is a system secret: one key for every installation of the app. Create a
Power-Up at <https://trello.com/power-ups/admin> and generate its API key there.
`TRELLO_TOKEN` is an installation secret: each installation has its own. Generate it from the
same page, with the "Token" link next to the API key, signed in as the Trello user the
installation should act as.

## Terms of use

Trello is an Atlassian product. Atlassian's terms apply to everything the app does on your
behalf: the Atlassian Customer Agreement,
<https://www.atlassian.com/legal/atlassian-customer-agreement>, and, for the API key, the
Atlassian Developer Terms,
<https://developer.atlassian.com/platform/marketplace/atlassian-developer-terms/>.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Atlassian's
press kit, brand guidelines or Trello's own site). They have been in the repository since before
this README existed and their origin was not written down.
