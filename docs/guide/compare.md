# Compare rendered styles

`europa compare` replaces one selected stylesheet in a rendered page, measures
the old and new compiled CSS on the same DOM, and reports changed computed
properties and element boxes. It supplements `europa migrate`; it does not
change the project's CSS files.

## Prepare the browser and builds

This optional command requires **Node.js 22+** and a **Chromium browser with a
CDP endpoint**. Compilation, migration analysis, and Studio still need no Node
runtime. The comparison helper is embedded in the native executable and has no
npm dependencies or browser downloads.

Start your installed Chromium browser with a separate debugging profile. For
example, on a system with `chromium` on PATH:

```sh
chromium --remote-debugging-port=9222 --user-data-dir=/tmp/europa-compare-profile \
  --use-mock-keychain --password-store=basic
```

Use the equivalent executable path for Chrome on your system. The keychain flags
avoid macOS's “Chromium Safe Storage” login prompt in this disposable testing
profile; use it only for testing, not as your everyday password store.
Keep only one live application session during comparison: another browser/tab
can trigger presence updates or LiveView patches that remove measured elements.
 Open the running
application and log in if needed. The command's new tabs share this browser
session. Save both **compiled** CSS builds locally; Europa source directives
must already have been expanded. Relative assets in both snapshots must resolve
correctly from the selected stylesheet's URL.

## Compare desktop and mobile

From the application directory, using its actual CSS paths and loaded stylesheet
URL:

```sh
europa compare http://localhost:4000/admin \
  --before snapshots/admin-old.css \
  --after public/admin.css \
  --stylesheet /assets/admin.css \
  --root '#brando-main' \
  --wait-for '#brando-main .brando-form' \
  --viewport 1440x900 --viewport 390x844 \
  --json > comparison.json
```

`--stylesheet` must match exactly one loaded main-frame stylesheet. Relative URLs
are resolved against the page URL. The stylesheet is edited in place through
CDP, preserving its position among other sheets and its base URL. Other styles
stay loaded. New tabs are closed after comparison.

The default CDP endpoint is `http://127.0.0.1:9222`; change it with `--cdp`.
The default root is `html`, readiness selector is `body`, and viewport is
1440×900. Up to 20 viewports can be checked in one invocation.

## Compare an already prepared interaction state

For an open dialog, editor, or other state, use the browser's page target ID from
its `/json/list` endpoint:

```sh
europa compare http://localhost:4000/admin/settings \
  --target PAGE_TARGET_ID \
  --before snapshots/admin-old.css --after public/admin.css \
  --stylesheet /assets/admin.css --root '#brando-main' --json
```

The target's URL must match exactly. This mode neither navigates nor resizes the
tab; omit `--viewport`. The original stylesheet is restored after success or
failure. If the browser disconnects or the command is interrupted before
restoration, reload the tab.

## Emulate media features

Repeat `--emulate` for discrete media features and use `--touch` for coarse
pointer/no-hover input:

```sh
europa compare http://localhost:4000/admin/settings \
  --target PAGE_TARGET_ID \
  --before snapshots/admin-old.css --after public/admin.css \
  --stylesheet /assets/admin.css --root '#brando-main' \
  --emulate prefers-reduced-motion=reduce --touch --prime --json
```

Both sheets are measured under the same emulation. Requested features are checked
with `matchMedia`; unsupported or unapplied values fail instead of silently
comparing the wrong state. `--emulate` accepts `name=value` pairs (for example
`prefers-color-scheme=dark`), with no duplicate names. Do not combine `--touch`
with explicit pointer/hover overrides. Touch emulation is verified to produce
`pointer: coarse` and `hover: none`; it does not resize the viewport.

Reports record the requested `emulation` even on errors; completed viewport
results also include the verified media features. Emulation is applied before
navigation in new-tab mode, or before readiness/sampling in prepared-tab mode.
Application changes triggered by media features must settle before measurement.

These flags replace existing overrides for their emulation domain and reset it
to **browser defaults** after success or failure (`cleanup: "browser-defaults"`
in the report). CDP cannot read and restore another client's override settings.
Reapply external media/touch overrides afterward if needed. With neither flag,
comparison leaves external emulation alone. Animation suppression still applies:
reduced-motion emulation tests styles/layout under that condition, not animation
playback.

## Read the evidence

The report includes per-viewport coverage, element selectors, changed properties,
box coordinates/sizes, and pseudo-element appearance/disappearance. JSON also
records the browser version, selected root, and SHA-256 hashes of both CSS
snapshots so the evidence identifies the exact builds. Geometry
uses a default tolerance of 0.1 CSS pixels, adjustable with `--tolerance`.
Computed property strings are compared exactly. Without `--json`, the same
changes are printed as readable text.

Exit codes are **0** for no detected differences, **1** for differences, and
**2** for errors or unstable/incomplete comparisons. JSON failures have
`complete: false`. A successful comparison means only the recorded page state
and viewports were checked.

Reports use schema version 4. `--ignore-custom-properties` excludes computed
`--*` properties from differences, avoiding inherited palette changes repeated
on every descendant. Ordinary computed properties still reveal their visual
effects. `nonCustomChangedElements` counts samples with geometry, pseudo-element
presence, or ordinary property changes even when custom properties are included.

The command measures **A, B, A**, with two stability samples per phase. Geometry
that fails to reproduce on returning to A is excluded from `changes` and listed
in `discardedGeometry` with the initial and returned measurements. Such a run is
marked incomplete (exit 2), so excluded evidence cannot silently pass CI.
Non-reproducing computed styles also make the run incomplete.

Some native controls change geometry on the first stylesheet replacement even
when comparing a sheet with itself. Use `--prime` to perform one unmeasured
A/B/A swap cycle before the measured A/B/A cycle. Fonts, layout frames, and the
configured `--settle` delay are awaited after each swap; animation suppression
remains active throughout. The report records `priming: "A/B/A"` (or `"none"`
without the flag), including on errors. This tests the state after priming;
it does not certify the initial replacement or subtract control differences.

Priming keeps the same DOM, stylesheet position, and original-sheet restoration.
DOM mutations during priming make the run incomplete. All measured stability and
return-to-baseline checks still apply, including `discardedGeometry`. Comparing
identical CSS still runs the complete measurement sequence.

### Interpret identical-CSS controls separately

An A/A control (`--before` and `--after` pointing to the same sheet) is a useful
diagnostic, but it does not reliably predict whether priming settles an A/B
comparison. The stylesheet pair can affect the layout history. A successful A/A
control does not prove A/B will be stable, and an incomplete A/A control does not
automatically invalidate a separately complete A/B run.

Brando's open flatpickr calendar demonstrated this distinction: primed comparisons
of the original and candidate sheets completed without differences in both
directions, while primed identical-CSS controls still discarded a one-pixel
`select` offset. Adding a trailing comment or a nonmatching rule, or increasing
`--settle`, did not resolve those controls. The browser mechanism behind this
pair-dependent behavior has not been established; text differences alone are not
evidence that priming exercised the same layout path.

For a replacement artefact, save A/A and B/B controls alongside the actual
comparison. Run the actual pair in both directions with `--prime`, preparing the
same page state for each run. Evaluate each report's `complete`, stability, and
`discardedGeometry` evidence independently, and record failed controls as a
coverage limitation. Only complete runs support a result for their measured
post-priming state; they do not certify the initial replacement or every state.
Keep incomplete controls marked incomplete. Do not subtract their geometry from
the actual comparison, bypass the stability checks, or insert a styling
perturbation and treat the resulting state as an identical-CSS control.

Instability errors include an `evidence` object with the phase, changed-sample
count, and up to five selectors with geometry and property values (up to ten
properties each). Text output prints this evidence too. Removed-element errors
identify the element. A narrower `--root` may exclude unrelated widgets, but
also narrows what the comparison verifies.

The command waits for fonts between samples, separated by
`--settle` milliseconds (default 250). Changing DOM, computed styles, or geometry
causes an incomplete result instead of a misleading diff. Pause live updates or
prepare a stable fixture when necessary. Animations/transitions are disabled
temporarily during measurement.

Coverage includes the selected main-document subtree and generated `::before`
and `::after` computed styles. It excludes iframe/shadow-root contents,
pseudo-element boxes, animation behavior, and selector performance. Excluded
iframes and open shadow roots are counted. The command stops above 10000 elements
or 2000000 computed values; use a smaller root for large pages.
