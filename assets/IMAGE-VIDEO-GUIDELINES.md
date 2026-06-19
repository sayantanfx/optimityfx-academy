# Image & Video Guidelines for OptimityFX Website

A quick reference for preparing media before adding it to the site. Following this keeps pages fast (good Core Web Vitals / SEO) and visually consistent.

## 1. Format

| Type | Use | Why |
|---|---|---|
| Photos / graphics / thumbnails | **WebP** | 25-50% smaller than JPG/PNG at the same quality, supports transparency |
| Icons / logos / line art | **SVG** (preferred) or WebP if it's a photo-based logo | Infinitely scalable, tiny file size |
| Video | **Don't upload video files to the site.** Host on Vimeo/YouTube and embed | Avoids huge file sizes, gives adaptive streaming, captions, analytics |

Avoid PNG/JPG for new uploads — convert to WebP before adding to `assets/`.

## 2. Target dimensions by placement

| Placement | Recommended size (px) | Notes |
|---|---|---|
| Logo (nav/footer/cert) | 332 × 112 (`logo-nav.webp`) | Reuse the existing file — don't re-upload per page |
| Logo (og:image / social share) | 878 × 296 (`logo.webp`) | Only used in meta tags |
| Hero / banner images | 1600 × 900 (16:9) | Largest images on the site — keep under ~150K |
| Service / portfolio cards | 700 × 600 | Matches current grid tiles |
| Portfolio lightbox ("full" image) | 1280 × 720 (16:9) | Used via `data-full` attribute |
| Team photos | 600 × 600 (1:1) | Square crop, face centered |
| Blog thumbnails | 1200 × 675 (16:9) | Also reused for og:image on blog posts |
| Store product covers | 800 × 800 (1:1) | |
| Favicon / app icons | SVG | Already handled via `favicon.svg` |

If unsure, match the **aspect ratio** of an existing image in the same folder (`assets/portfolio/`, `assets/services/`, etc.) — CSS often crops with `object-fit: cover`, so exact pixels matter less than ratio.

## 3. Compression targets

- **Quality 80-85** for WebP is the sweet spot (visually lossless at display size, ~40-60% smaller than quality 95+).
- **File size budget per image:**
  - Thumbnails / cards: **30-80 KB**
  - Hero / lightbox full-res: **under 150 KB**
  - Logos / icons: **under 25 KB**
- If a file is consistently over budget, the source resolution is probably too high — resize down to the target dimensions above *before* compressing, rather than compressing harder.

### Quick conversion (Python/Pillow, since `cwebp` isn't installed)

```python
from PIL import Image
img = Image.open("source.jpg")
img = img.resize((1200, 675), Image.LANCZOS)   # resize to target first
img.save("assets/blog/new-post.webp", "webp", quality=82, method=6)
```

- Use `Image.LANCZOS` for resizing — best quality for downscaling.
- `method=6` = slowest but best compression (fine for one-off conversions).
- Keep `RGBA` mode only if the image actually needs transparency (logos). Photos should be `RGB` — saves space.

## 4. Video guidance

The site currently has **zero local video files** — all video content (showreel, etc.) is via Vimeo embeds. Keep it that way:

- Upload the actual video to **Vimeo** (or YouTube), set privacy/embed settings there.
- Embed via `<iframe>` as already done — never link a raw `.mp4`/`.mov` from `assets/`.
- For the **poster/thumbnail** image shown before the video plays, follow the hero/16:9 image rules above (1600×900 or 1280×720, WebP, <150K).
- If you need an autoplaying background loop, keep it **under 5 seconds, muted, and as a Vimeo "background mode" embed** — never a self-hosted video file (these can be multi-MB and tank page speed).

## 5. Naming & organization

Keep using the existing folder structure under `assets/`:

```
assets/
  academy/    – course/academy related images
  blog/       – blog post thumbnails & hero images
  portfolio/  – portfolio tiles + lightbox images
  services/   – service page hero/mid images
  store/      – product covers
  team/       – team headshots (square)
```

Naming convention: lowercase, hyphen-separated, descriptive — e.g. `synthwave-dreams.webp`, `service-commercial-hero.webp`. Avoid generic names like `image1.webp`.

## 6. Checklist before adding a new image

1. Resize to the target dimensions for its placement (section 2).
2. Convert to WebP at quality 80-85.
3. Check file size is within budget (section 3) — re-encode at lower quality if not.
4. Name it descriptively and put it in the right `assets/` subfolder.
5. Add `loading="lazy"` on `<img>` tags below the fold (already the pattern used across the site).
6. For og:image/twitter:image, use an existing 16:9 image rather than creating a new one if possible.
