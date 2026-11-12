---
"@agentapps/station": minor
"@agentapps/protocol": minor
---

Enhance launcher with condition evaluation and auto-open

The `GET /launcher` page now:
- Embeds manifest data as JSON in a `<script type="application/json">` tag
- Evaluates screen `condition` predicates client-side (e.g. `'authenticated'`, `'!authenticated'`)
- Auto-opens the first eligible launcher screen in a sandboxed iframe
- Provides an "Authenticated" toggle to test condition-based visibility
- Uses a sidebar + content layout with app cards on the left and iframe on the right
- Adds `data-condition` and `data-bundle-url` attributes to screen buttons for JS interactivity
- Handles screens without `bundleUrl` gracefully (listed but not openable in iframe)

Protocol `ScreenDeclarationSchema` gains `launcher` and `condition` fields
with full Zod validation and type guards (`isLauncherScreen`).
