---
"@agentapps/cli": patch
---

zsh completions no longer print `command not found: compdef` in shells that never ran compinit (stock macOS zsh): the script loads compinit first when needed.
