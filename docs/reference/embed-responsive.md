# @embed-responsive

Creates a responsive aspect-ratio container for embedded content (videos, iframes, etc.).

## Syntax

```css
@embed-responsive {width}/{height};
```

## Usage

```css
.video-wrapper {
  @embed-responsive 16/9;
}

.square {
  @embed-responsive 1/1;
}

.portrait {
  @embed-responsive 3/4;
}
```

## Output

```css
/* Input */
.video-wrapper {
  @embed-responsive 16/9;
}

/* Output */
.video-wrapper {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  overflow: hidden;
}
.video-wrapper::before {
  content: "";
  display: block;
  padding-top: 56.25%; /* 9/16 * 100 */
}
```

Place the embedded content (iframe, video) as an absolutely-positioned child inside the wrapper.
