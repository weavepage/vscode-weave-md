---
id: intro
title: Weave Test Suite
peek: Comprehensive test of all Weave features
---
# Weave Test Suite

## Node Links

### Text-linked References

This tests [footnote display](node:fn-basic?display=footnote) with text.

This tests [inline display](node:inline-basic?display=inline) with text.

This tests [overlay display](node:overlay-basic?display=overlay) with text.

This tests [panel display](node:panel-basic?display=panel) with text.

This tests [sidenote display](node:sidenote-basic?display=sidenote) with text. This tests [sidenote display](node:sidenote-basic?display=sidenote) with text.

### Anchor-only References

Footnote anchor only: [ ](node:fn-anchor?display=footnote)

Inline anchor only: [ ](node:inline-anchor?display=inline)

Overlay anchor only: [ ](node:overlay-anchor?display=overlay)

Panel anchor only: [ ](node:panel-anchor?display=panel)

---

## Multiple References

### Same Footnote Referenced Twice

First reference to shared footnote.[ ](node:fn-shared?display=footnote)

Second reference to same footnote.[ ](node:fn-shared?display=footnote)

---

## Nested References

### Overlay in Inline

Click to expand [inline with overlay](node:inline-with-overlay?display=stretch).

### Overlay in Footnote

This has a footnote that contains an overlay.[ ](node:fn-with-overlay?display=footnote)

### Overlay in Panel

Click to expand a [panel with an overlay](node:panel-with-overlay?display=panel).

---

## Formats in Different Contexts

Formats as [footnote](node:format-examples?display=footnote), [inline](node:format-examples?display=inline), and [overlay](node:format-examples?display=overlay).

---

## Format Examples in Main Text

### Strikethrough

This is ~~struck through~~ text.

### Table

| Feature | Status | Notes |
|---------|:------:|------:|
| Tables | ✓ | GFM style |
| Alignment | ✓ | Left, center, right |

### Autolink

Visit https://example.com or email test@example.com automatically.

### Preformatted

```pre
  Spaces are
    preserved
      exactly.
```

### Math Block

```math
\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}
```

### Inline Math

The quadratic formula is :math[x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}].

### Image

```image
file: https://picsum.photos/600/400
alt: Sample landscape
caption: A sample image with caption
```

### Gallery

```gallery
files:
  - https://picsum.photos/300/200?1
  - https://picsum.photos/300/200?2
  - https://picsum.photos/300/200?3
caption: A gallery of images
```

### Audio

```audio
file: https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3
controls: true
```

### Video

```video
file: https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
poster: https://picsum.photos/600/400
controls: true
```

### Embed

```embed
url: https://www.youtube.com/embed/DnWocYKqvhw?si=o_pYDp2ZvA_U3J_w
```