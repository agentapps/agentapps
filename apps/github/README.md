# GitHub

Lets an agent work with GitHub repositories in two ways. Through the GitHub REST API
(`https://api.github.com`, version `2022-11-28`) it reads and changes repositories, issues, pull
requests, branches, commits, releases, files, check runs and Actions workflows, signed with the
user's own token from a GitHub App. Through the `git` command on the machine where the app runs
it clones a repository and works on the clone: status, add, commit, push, pull, branches,
history.

Main limits:

- The app sends each request once: no retry, no automatic pagination. List tools return one
  page; pass `per_page` and `page` where the tool has them.
- The app does not refresh the user's token. When GitHub rejects it, the tool returns GitHub's
  message (`Bad credentials`).
- The `git-*` tools need `git` installed. They only work inside the workspace directory: the
  path in `MCA_WORKSPACE_PATH`, or `/workspace` if it exists, or the directory the app was
  started in. A `repoPath` outside it is refused. `clone-repo` clones into `/workspace/<repo>`
  unless you pass `destination`.
- `git-config` reads and writes only a fixed list of keys (`user.name`, `user.email`,
  `pull.rebase` and a few more).

## Tools

70 tools. Every tool that writes asks for approval first.

### GitHub API

| Tool | What it does | Writes? |
|---|---|---|
| `list-repos` | Lists the repositories the user can reach through the GitHub App, across its installations. `owner` filters them. | no |
| `get-repo` | Returns one repository. | no |
| `create-repo` | Creates a repository for the user, or in an organization with `org`. | yes, asks first |
| `search-repos` | Searches repositories on GitHub. | no |
| `list-issues` | Lists the issues of a repository, filtered by state and labels. | no |
| `get-issue` | Returns one issue. | no |
| `create-issue` | Creates an issue, with labels and assignees. | yes, asks first |
| `update-issue` | Changes an issue's title, body, state or labels. `labels` replaces the whole set. | yes, asks first |
| `add-issue-comment` | Adds a comment to an issue. | yes, asks first |
| `add-labels-to-issue` | Adds labels to an issue or pull request and returns the resulting set. | yes, asks first |
| `search-issues` | Searches issues and pull requests with GitHub's search syntax. | no |
| `list-pulls` | Lists the pull requests of a repository. | no |
| `get-pull` | Returns one pull request. | no |
| `create-pull` | Opens a pull request, as a draft if asked. | yes, asks first |
| `merge-pull` | Merges a pull request (merge, squash or rebase). It cannot be undone through the app. | yes, asks first |
| `list-pr-files` | Lists the files a pull request changes. | no |
| `list-pr-commits` | Lists the commits of a pull request. | no |
| `list-pr-review-comments` | Lists the inline review comments of a pull request. | no |
| `request-reviewers` | Requests a review from users or teams. | yes, asks first |
| `create-pr-review` | Submits a review: approve, request changes or comment, with inline comments. | yes, asks first |
| `list-branches` | Lists the branches of a repository. | no |
| `get-branch` | Returns one branch. | no |
| `create-branch` | Creates a branch from another one (`main` by default). | yes, asks first |
| `list-commits` | Lists the commits of a repository or branch. | no |
| `get-commit` | Returns one commit. | no |
| `compare-commits` | Compares two commits or branches, given as `BASE...HEAD`. | no |
| `list-workflows` | Lists the Actions workflows of a repository. | no |
| `list-workflow-runs` | Lists workflow runs, of one workflow or of the repository, filtered by status. | no |
| `get-workflow-run` | Returns one workflow run. | no |
| `list-workflow-run-jobs` | Lists the jobs of a workflow run. | no |
| `trigger-workflow` | Starts a workflow with a `workflow_dispatch` event. A run can deploy or publish. | yes, asks first |
| `rerun-workflow-run` | Runs a workflow run again: the failed jobs by default, or all of them. | yes, asks first |
| `cancel-workflow-run` | Cancels a workflow run in progress. | yes, asks first |
| `list-releases` | Lists the releases of a repository, newest first. | no |
| `create-release` | Creates a release on a tag. | yes, asks first |
| `get-file-content` | Returns a file of a repository, with its decoded text, or a directory listing. | no |
| `create-or-update-file` | Creates a file, or replaces it when given its `sha`, in one commit. | yes, asks first |
| `search-code` | Searches code on GitHub. | no |
| `get-installation-context` | Lists the GitHub App installations the user can reach, with their repositories and permissions. | no |
| `get-user` | Deprecated: the same as `get-installation-context`. | no |
| `create-check-run` | Creates a check run on a commit. | yes, asks first |
| `update-check-run` | Changes a check run's status, conclusion or output. | yes, asks first |
| `get-rate-limit` | Returns what is left of the API rate limit. | no |
| `dispatch-event` | Sends a `repository_dispatch` event, which starts the workflows that listen to it. | yes, asks first |

### Local git

These run `git` on the machine where the app runs. `clone-repo`, `git-fetch`, `git-pull` and
`git-push` pass the user's token to git in a header for that one command; it is not written to
the clone's configuration.

| Tool | What it does | Writes? |
|---|---|---|
| `clone-repo` | Clones a repository into a new directory. It refuses a directory that exists. | yes, asks first |
| `git-status` | Returns the branch, how far it is ahead and behind, and the staged, modified, untracked and conflicted files. | no |
| `git-add` | Stages paths, or everything. | yes, asks first |
| `git-commit` | Commits the staged changes, or amends the last commit. | yes, asks first |
| `git-push` | Pushes a branch. `force` uses `--force-with-lease`, `forceUnsafe` uses `--force`. | yes, asks first |
| `git-checkout` | Switches branch, creates one, or restores paths. `force` discards local changes. | yes, asks first |
| `git-rm` | Removes tracked files and stages the removal. | yes, asks first |
| `git-mv` | Moves or renames a tracked file. `force` overwrites the destination. | yes, asks first |
| `git-read-file` | Reads a file from the working tree or from a revision. | no |
| `git-write-file` | Writes a file in the working tree, replacing what is there, and stages it. | yes, asks first |
| `git-list-files` | Lists tracked, untracked and, if asked, ignored files. | no |
| `git-pull` | Pulls from the remote, with a merge or a rebase. | yes, asks first |
| `git-diff` | Returns a diff and its per-file counts: working tree, index, or between two refs. | no |
| `git-log` | Returns the commit history (20 commits by default, 500 at most). | no |
| `git-batch-commit` | Creates, updates, deletes and renames several files and makes one commit. It needs a clean tree and undoes its changes if the commit fails. | yes, asks first |
| `git-stash` | Saves, restores, lists, drops or clears stashes. | yes, asks first |
| `git-merge` | Merges a ref into the current branch. | yes, asks first |
| `git-rebase` | Rebases the current branch, or continues, skips or aborts a rebase. | yes, asks first |
| `git-reset` | Resets HEAD: `soft`, `mixed` or `hard`. `hard` discards local changes. | yes, asks first |
| `git-cherry-pick` | Applies commits to the current branch. | yes, asks first |
| `git-config` | Reads, sets or unsets an allowed git setting, in the repository or globally. | yes, asks first |
| `git-tag` | Lists, creates or deletes local tags. | yes, asks first |
| `git-remote` | Lists, adds, changes or removes remotes. | yes, asks first |
| `git-blame` | Returns who last changed each line of a file. | no |
| `git-bisect` | Drives a bisect: start, good, bad, skip, reset, log. | yes, asks first |
| `git-fetch` | Fetches from the remote without merging. | yes, asks first |

## Setup

The app signs in through a GitHub App. Register one first
(<https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/registering-a-github-app>)
with the repository permissions the manifest lists (contents, issues, pull requests, workflows,
actions and checks: write; metadata, members and administration: read), and set its values as
system secrets, once for every installation:

```bash
agentapps install app.github github
agentapps config app.github GITHUB_APP_ID:<app id> GITHUB_APP_SLUG:<app slug>
agentapps config app.github GITHUB_APP_CLIENT_ID:<client id> GITHUB_APP_CLIENT_SECRET:<client secret>
agentapps config app.github GITHUB_APP_PRIVATE_KEY:<private key> GITHUB_APP_WEBHOOK_SECRET:<webhook secret>
agentapps github tools
agentapps github tool list-issues owner:<owner> repo:<repo> state:open
```

Every value is on the GitHub App's settings page. `GITHUB_APP_SLUG` is the name in the app's URL
(`https://github.com/apps/<slug>`); the app uses it to tell a user where to install the GitHub
App.

Each installation then needs the user's own token, the installation secret
`USER_ACCESS_TOKEN`: a user access token of that GitHub App. The tools need nothing else from
the installation. The other installation secrets (`INSTALLATION_ID`, `USER_REFRESH_TOKEN`,
`USER_TOKEN_EXPIRES_AT`, `USER_LOGIN`) are declared for the host that signs the user in; the
tools do not read them.

TODO: say which command signs the user in. This README was written from the app's code, which
only reads the token; it was not confirmed that `agentapps github auth` runs the GitHub App
sign-in for this auth type (`github-app`). A token set by hand goes in with
`agentapps config github USER_ACCESS_TOKEN:<token>`.

## Terms of use

GitHub's Terms of Service apply to everything the app does with your account:
<https://docs.github.com/en/site-policy/github-terms/github-terms-of-service>. The REST API has
rate limits, described at
<https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api>;
`get-rate-limit` returns what is left. Workflow runs started with `trigger-workflow`,
`rerun-workflow-run` or `dispatch-event` use the repository's GitHub Actions minutes.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (GitHub's brand
resources or its own site). They have been in the repository since before this README existed
and their origin was not written down.
