# Google News

Lets an agent read current news headlines from the public Google News RSS feed
(`https://news.google.com/rss`): the top stories of a country's edition, or the stories that
match a search. It needs no account and no key. It returns headlines, sources, links and
dates; it does not open or read the articles.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `headlines` | Returns the latest headlines (title, source, Google News link, date and how long ago), 5 by default and up to 15. `topic` searches for a subject; `region` picks the edition. | no |

Limits:

- `region` knows these editions: Spain, US, UK, France, Germany, Italy, Portugal, Brazil,
  Mexico and Japan (by English name or two-letter code). Any other value, and `Europe` or
  `global`, returns the United States edition in English.
- Links are Google News redirect links, not the publisher's address.
- `relatedHeadlines` is empty in this version: the feed escapes the HTML of the related
  stories and the app does not read it yet.
- There is no retry: if Google News answers an error, the tool fails with the status.

## Setup

```bash
agentapps install app.google-news news
agentapps news tools
agentapps news tool headlines topic:"artificial intelligence" region:Spain count:5
```

There is nothing to configure: the app has no secrets.

## Terms of use

The feed is Google's and the [Google Terms of Service](https://policies.google.com/terms) apply.
The feed itself carries this notice: "This XML feed is made available solely for the purpose of
rendering Google News results within a personal feed reader for personal, non-commercial use.
Any other use of the feed is expressly prohibited." Check that your use fits it before you
install the app for anything other than personal use. Google publishes no rate limit for the
feed.

## Logos

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (Google's
brand resources or its own site). They have been in the repository since before this README
existed and their origin was not written down. The manifest also names `icon.svg`, which does
not exist.
