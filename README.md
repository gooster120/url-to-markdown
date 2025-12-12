# HTML to Markdown Converter

A browser-based tool for converting HTML to clean Markdown, designed for preparing text data for LLM consumption.

## Features

- HTML to Markdown conversion using Turndown with GFM support
- URL fetching via CORS proxies (allorigins, corsproxy.io, codetabs)
- CSS selector picker with auto-extraction of IDs, classes, and semantic tags
- Table alignment for consistent Markdown output
- Metadata extraction (title, description, Open Graph, Twitter cards)
- JSON export with conversion metadata
- Noise removal (ads, navigation, scripts, hidden elements)
- Media handling (strip or replace with alt text)
- Link preservation toggle

## Usage

1. Enter a URL and click Fetch, or paste HTML directly
2. Select a CSS selector from the picker or type one manually
3. Configure options (table alignment, noise removal, etc.)
4. Click Convert to Markdown
5. Copy or download the output

## File Structure

```
├── index.html      # Main application
├── css/
│   └── main.css    # Styles
└── js/
    ├── config.js   # Tailwind configuration
    └── app.js      # Application logic
```

## Dependencies

External libraries loaded via CDN:

- [Turndown](https://github.com/mixmark-io/turndown) - HTML to Markdown conversion
- [Turndown Plugin GFM](https://github.com/mixmark-io/turndown-plugin-gfm) - GitHub Flavored Markdown support
- [DOMPurify](https://github.com/cure53/DOMPurify) - HTML sanitization
- [Marked](https://github.com/markedjs/marked) - Markdown preview rendering
- [Tailwind CSS](https://tailwindcss.com/) - Styling

## CORS Proxies

URL fetching uses public CORS proxies with automatic fallback:

1. api.allorigins.win
2. corsproxy.io
3. api.codetabs.com

For production use, deploy your own proxy server or use a browser extension to bypass CORS restrictions.

## Token Counting

This tool does not include token counting. Use these resources:

- OpenAI: https://platform.openai.com/tokenizer
- Google: https://ai.google.dev/gemini-api/docs/tokens

For pricing, check your LLM provider's documentation.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+Enter | Convert HTML |
| Ctrl+Shift+C | Copy output |
| Ctrl+Shift+F | Fetch URL |
| Ctrl+Shift+X | Clear input |
| ? | Show help |
| Esc | Close modals |

## Selector Picker

After fetching HTML or pasting content, the selector panel displays:

- **IDs** (orange) - Element IDs found in the document
- **Classes** (green) - CSS classes, filtered to exclude framework prefixes
- **Tags** (purple) - Semantic HTML5 tags (article, main, section, etc.)

Clicking a selector updates the input field and shows the corresponding HTML element.

### Selector Drilling

After clicking a selector, the panel automatically shows **children of that element**:

- Numbers in parentheses (e.g., `.content (5)`) indicate how many children that element has
- Click children to drill deeper
- Click **"← Show all"** to go back to the full selector list

This helps navigate deeply nested content without knowing exact CSS selectors.

## Output Formats

### Markdown
Clean Markdown with aligned tables, proper heading hierarchy, and GFM syntax.

### JSON
```json
{
  "markdown": "...",
  "metadata": {
    "title": "...",
    "description": "...",
    "og_title": "..."
  },
  "sourceUrl": "...",
  "selector": "...",
  "timestamp": "...",
  "options": {...},
  "stats": {
    "characters": 0,
    "words": 0,
    "lines": 0
  }
}
```

## Options

| Option | Description |
|--------|-------------|
| Align Tables | Format Markdown tables with consistent column widths |
| Strip Media | Remove images/video or replace with alt text placeholders |
| Smart Clean | Remove scripts, styles, ads, navigation, hidden elements |
| Extract Meta | Parse metadata from HTML head |
| Keep Links | Preserve or strip hyperlinks |

## CLI Tool

A command-line version is available for developers building RAG pipelines.

### Quick Start

```bash
# Navigate to CLI directory
cd cli

# Install dependencies
npm install

# Run directly
node bin/md4llm.js https://example.com

# Or link for global usage
npm link
md4llm https://example.com
```

### Examples

```bash
# Convert webpage to markdown
md4llm https://docs.python.org -s "#content" -o docs.md

# Extract with metadata as JSON
md4llm https://example.com --meta --format json

# Batch process URLs
md4llm --batch urls.txt -o ./output/

# Pipe from stdin
curl -s https://example.com | md4llm -

# Interactive selector drilling
md4llm https://docs.python.org --interactive
```

See [cli/README.md](cli/README.md) for full documentation.

## Local Development

Open `index.html` in a browser. No build step required.

For local file access, serve via HTTP:

```bash
python -m http.server 8000
```

## License

MIT

