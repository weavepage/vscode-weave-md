/**
 * Media block renderers for Weave preview
 * Handles: math, image, gallery, audio, video, embed, pre
 */

import { escapeHtml, parseYamlBlock } from '../utils';

/**
 * Renders a math block using KaTeX
 */
export function renderMathBlock(content: string): string {
  try {
    const katex = require('katex');
    const html = katex.renderToString(content.trim(), {
      displayMode: true,
      throwOnError: false,
      output: 'html'
    });
    return `<div class="weave-math weave-math-block" data-weave="1">${html}</div>`;
  } catch {
    return `<div class="weave-math weave-math-block weave-math-error" data-weave="1">
      <pre>${escapeHtml(content)}</pre>
      <span class="weave-error">Math rendering error</span>
    </div>`;
  }
}

/**
 * Renders an image block from YAML content
 */
export function renderImageBlock(content: string): string {
  const data = parseYamlBlock(content);
  const file = String(data.file || '');
  const alt = String(data.alt || '');
  const caption = String(data.caption || '');
  const width = data.width ? `width="${escapeHtml(String(data.width))}"` : '';
  
  if (!file) {
    return `<div class="weave-media weave-image weave-error" data-weave="1">
      <span class="weave-error">Missing file in image block</span>
    </div>`;
  }
  
  return `<figure class="weave-media weave-image" data-weave="1">
    <img src="${escapeHtml(file)}" alt="${escapeHtml(alt)}" ${width} />
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

/**
 * Renders a gallery block from YAML content
 */
export function renderGalleryBlock(content: string): string {
  const data = parseYamlBlock(content);
  const files = Array.isArray(data.files) ? data.files : [];
  const caption = String(data.caption || '');
  
  if (files.length === 0) {
    return `<div class="weave-media weave-gallery weave-error" data-weave="1">
      <span class="weave-error">No files in gallery block</span>
    </div>`;
  }
  
  const images = files.map((f: unknown) => {
    const file = typeof f === 'string' ? f : String((f as Record<string, unknown>)?.file || '');
    const alt = typeof f === 'object' ? String((f as Record<string, unknown>)?.alt || '') : '';
    return `<img src="${escapeHtml(file)}" alt="${escapeHtml(alt)}" />`;
  }).join('');
  
  return `<figure class="weave-media weave-gallery" data-weave="1">
    <div class="weave-gallery-grid">${images}</div>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

/**
 * Renders an audio block from YAML content
 */
export function renderAudioBlock(content: string): string {
  const data = parseYamlBlock(content);
  const file = String(data.file || '');
  const caption = String(data.caption || '');
  
  if (!file) {
    return `<div class="weave-media weave-audio weave-error" data-weave="1">
      <span class="weave-error">Missing file in audio block</span>
    </div>`;
  }
  
  return `<figure class="weave-media weave-audio" data-weave="1">
    <audio controls src="${escapeHtml(file)}"></audio>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

/**
 * Renders a video block from YAML content
 */
export function renderVideoBlock(content: string): string {
  const data = parseYamlBlock(content);
  const file = String(data.file || '');
  const caption = String(data.caption || '');
  const width = data.width ? `width="${escapeHtml(String(data.width))}"` : '';
  
  if (!file) {
    return `<div class="weave-media weave-video weave-error" data-weave="1">
      <span class="weave-error">Missing file in video block</span>
    </div>`;
  }
  
  return `<figure class="weave-media weave-video" data-weave="1">
    <video controls ${width} src="${escapeHtml(file)}"></video>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

/**
 * Renders an embed block from YAML content
 */
export function renderEmbedBlock(content: string): string {
  const data = parseYamlBlock(content);
  const url = String(data.url || '');
  const caption = String(data.caption || '');
  
  if (!url) {
    return `<div class="weave-media weave-embed weave-error" data-weave="1">
      <span class="weave-error">Missing url in embed block</span>
    </div>`;
  }
  
  // Extract YouTube video ID for thumbnail display
  const youtubeMatch = url.match(/(?:youtube\.com\/embed\/|youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    const videoId = youtubeMatch[1];
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    
    return `<figure class="weave-media weave-embed weave-embed-youtube" data-weave="1" data-video-id="${escapeHtml(videoId)}">
      <div class="weave-embed-container" data-embed-url="${escapeHtml(embedUrl)}">
        <img src="${escapeHtml(thumbnailUrl)}" alt="YouTube video thumbnail" class="weave-embed-thumbnail" />
        <button class="weave-embed-play-button" type="button" aria-label="Play video">▶</button>
      </div>
      ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
    </figure>`;
  }
  
  // For non-YouTube embeds, show a link (iframes are blocked by VS Code CSP)
  return `<figure class="weave-media weave-embed" data-weave="1">
    <a href="${escapeHtml(url)}" class="weave-embed-link weave-embed-external" title="Open in browser">
      <span class="weave-embed-icon">🔗</span>
      <span class="weave-embed-url">${escapeHtml(url)}</span>
    </a>
    ${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ''}
  </figure>`;
}

/**
 * Renders a preformatted block
 */
export function renderPreBlock(content: string): string {
  return `<pre class="weave-pre" data-weave="1">${escapeHtml(content)}</pre>`;
}
