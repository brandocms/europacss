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
chromium --remote-debugging-port=9222 --user-data-dir=/tmp/europa-compare-profile
```

Use the equivalent executable path for Chrome on your system. Open the running
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

The command waits for fonts and samples each build twice, separated by
`--settle` milliseconds (default 250). Changing DOM, computed styles, or geometry
causes an incomplete result instead of a misleading diff. Pause live updates or
prepare a stable fixture when necessary. Animations/transitions are disabled
temporarily during measurement.

Coverage includes the selected main-document subtree and generated `::before`
and `::after` computed styles. It excludes iframe/shadow-root contents,
pseudo-element boxes, animation behavior, and selector performance. Excluded
iframes and open shadow roots are counted. The command stops above 10000 elements
or 2000000 computed values; use a smaller root for large pages.
