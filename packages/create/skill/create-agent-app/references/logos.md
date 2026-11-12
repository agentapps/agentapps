# Logo sourcing

Logos are brand assets. **Never generate, draw, trace or AI-create a logo**, and never "fix" one
by guessing colours. Only the user can lift this rule, explicitly.

## What is needed

| Manifest field | File | Requirements |
|---|---|---|
| `logo` | `assets/logo.svg` (or `.png`) | Real brand colours. SVG preferred; PNG only at 1024x1024 or larger. |
| `logoMono` | `assets/logo-mono.svg` | SVG only, with **no colours of its own and no `<style>`**: the host tints it (sidebar, dark mode). Remove every `fill`/`stroke` colour; `none`, `currentColor` and `inherit` may stay, since they let the tint through. |

## Where to look, in this order

1. The service's press kit or media kit ("press", "brand", "media" pages, often a zip).
2. The brand guidelines page (often has a one-colour variant: use it for `logoMono`).
3. An official design-system package or artwork repository published by the company.
4. The service's own website or official source repository: the SVG it shows as its logo.
   Favicons and web-manifest icons count only if they meet the size rule.

Brand pages are often rendered by JavaScript, so a page-fetch tool sees an empty shell. `curl`
the brand page and its per-asset subpages (`/logo`, `/icon`, `/<product>-icon`) and `grep` the
HTML for `.zip`, `.svg` and `download`: the kit's download URL is usually in it.

Not official, do not use: icon collections that redraw brands, encyclopedia redraws, icon
fonts, logo aggregator sites, screenshots, anything you made.

If the service's own site uses a generic third-party icon as its logo (for example an icon from
an open-source icon set), it counts as the official logo because the service uses it that way.
Record both facts in the README: where the service shows it, and where the icon comes from
(with its license).

## Turning an official logo into `logoMono`

Allowed: take the official one-colour variant, or the official logo, and remove `fill`
attributes, `fill:` style rules and the `<style>` element so only the shapes remain. If you took
it from a web framework component (Svelte, JSX), also remove the framework syntax (props,
`class`, `{width}`) so it is a plain SVG. Keep the paths unchanged. Not allowed: redrawing,
simplifying shapes, choosing which parts to keep.

If the only official logo is a coloured badge (shapes on a coloured background), stripping the
fills leaves a solid block: that is not a mono logo. Leave `logoMono` as a TODO instead.

If the official asset is a vector in another format (PDF, AI, EPS), converting it to SVG
without changing its paths is allowed: it is the same artwork in another container.

```bash
pdftocairo -svg logo.pdf logo.svg          # an .ai saved with PDF compatibility is a PDF
ps2pdf -dEPSCrop logo.eps logo.pdf         # EPS: to PDF first
```

Then check it: render the source and the SVG to PNG at the same size and compare them
(`pdftoppm -png -r 300 logo.pdf src`, `rsvg-convert -w <width> logo.svg > svg.png`), and do not
edit the `d` attributes the converter wrote. For the mono variant, convert the official
one-colour artwork the same way and remove the fills. Record the tool and command in the
Changes column. Not allowed: tracing a raster (PNG, JPG) into vectors, which redraws it.

An official SVG may start with an `<?xml ...?>` declaration that some linters (biome) cannot
parse. Removing that one line is allowed: it changes nothing visible. Note it in the Changes
column.

`check-app` fails if the mono logo still has colour fills or strokes or a `<style>`, and warns
about an XML declaration.

## Record provenance

Fill in the README's Logos section:

```md
## Logos

| File | Source | Changes |
|---|---|---|
| assets/logo.svg | Example press kit, ExampleBrandKit-2026.zip, `logo/example-logo.svg` | none |
| assets/logo-mono.svg | same kit, `logo/example-logo-black.svg` | removed `fill` attributes |
```

Put the same sources in the change description, one line.

## When there is no official asset (for one or both files)

Keep the placeholder path in the manifest, do **not** create the file, and write a TODO in the
README's Logos section listing where you looked and what you found:

```md
## Logos

TODO: no official colour logo found yet. Searched: example.com (no press or brand page),
the official website repository (PNG icons only, largest 512x512, below the 1024 minimum).
assets/logo-mono.svg: the website header icon, see the table above.
```

Each file is handled on its own: you can ship the mono logo and leave the colour one as a TODO.
The app installs and runs without the files. `check-app` reports a missing file as a warning
while the README's Logos section has a TODO, and as an error when it does not; the generated
manifest test shows a `todo` per missing file. Mention the TODO under "Not done yet" in the
change description.
