# RentAHuman.ai

Lets an agent find and book people for tasks in the physical world through the RentAHuman.ai
API (`https://rentahuman.ai/api`): search people by skill, rate or name, read a profile, create
a booking and follow it. Creating a booking commits to hiring a person and returns payment
instructions; the app does not pay.

## Tools

| Tool | What it does | Writes? |
|---|---|---|
| `search-humans` | Searches available people by skill, hourly rate range or name. | no |
| `get-human` | Returns one person's profile: skills, availability, hourly rate, location, rating and payment wallet addresses. | no |
| `create-booking` | Books a person for a task, with a start time and an estimate of hours. Returns the booking and payment instructions. | yes, asks first |
| `list-bookings` | Lists the current agent's bookings, optionally by status. | no |
| `get-booking` | Returns one booking and its current status. | no |

Limits:

- The app cannot change or cancel a booking.
- Only reads are retried on a transient error (twice). `create-booking` is never retried, so a
  failed call may need to be repeated by hand: check `list-bookings` first.

## Setup

```bash
agentapps install app.rentahuman rentahuman
agentapps config rentahuman RENTAHUMAN_API_KEY:<your key>
agentapps rentahuman tools
agentapps rentahuman tool search-humans skill:photography limit:5
```

`RENTAHUMAN_API_KEY` is an installation secret: each installation uses its own key, and
bookings are made in its name. The key starts with `rah_`. TODO: say where in RentAHuman.ai the
key is created; the app's code does not record it.

## Terms of use

RentAHuman.ai's own terms apply to everything the app does on your behalf. TODO: link them.
`https://rentahuman.ai` did not answer when this README was written (the connection timed out),
so no URL could be confirmed.

## Logos

Changed on 2026-11-23, asked for by the project owner. `assets/logo-mono.svg` kept the logo's square background as a shape, which made it a solid block. The background is removed; the figure's paths are unchanged.

TODO: record the official source of `assets/logo.svg` and `assets/logo-mono.svg` (RentAHuman.ai's
press kit, brand guidelines or its own site). They have been in the repository since before
this README existed and their origin was not written down.
`assets/logo.png` (512x512) is also in the repository; the manifest does not use it because a
PNG logo must be 1024x1024 or larger.
