# md4llm CLI

Command-line HTML to Markdown converter for LLM/RAG workflows.

## Installation

### Option 1: Clone & Link (Development)
```bash
cd cli
npm install
npm link
```

### Option 2: NPX (No Install)
```bash
npx md4llm https://example.com
```

### Option 3: Global Install
```bash
npm install -g md4llm
```

## Usage

```bash
md4llm [options] <input>
```

**Arguments:**
- `input` - URL, file path, or `-` for stdin

**Options:**
| Option | Description |
|--------|-------------|
| `-o, --output <file>` | Output file (default: stdout) |
| `-s, --selector <css>` | CSS selector to extract (default: body) |
| `-f, --format <type>` | Output format: md, json (default: md) |
| `--no-clean` | Disable noise removal |
| `--no-tables` | Disable table alignment |
| `--no-links` | Strip hyperlinks |
| `--strip-media` | Remove images/video |
| `--meta` | Include metadata extraction |
| `--batch <file>` | Process URLs from file |
| `--concurrency <n>` | Batch concurrency limit (default: 3) |
| `-i, --interactive` | Interactive selector drilling mode |
| `-q, --quiet` | Suppress progress output |

## Examples

### Convert a webpage
```bash
md4llm https://example.com
```

### Extract specific section
```bash
md4llm https://docs.python.org/3/tutorial/ -s "#content" -o tutorial.md
```

### Convert with metadata
```bash
md4llm https://example.com --meta --format json
```

### Pipe from stdin
```bash
curl -s https://example.com | md4llm -
```

### Local file
```bash
md4llm page.html -o output.md
```

### Batch processing
```bash
# Create urls.txt with one URL per line
md4llm --batch urls.txt -o ./output/
```

### Interactive Selector Drilling
```bash
# Start interactive mode to navigate the DOM
md4llm https://docs.python.org --interactive

# In interactive mode:
#   - Enter a number to drill into that child element
#   - Type 'b' to go back one level
#   - Type 'a' to accept the current selector and convert
#   - Type 'q' to quit without converting
```

## Output Formats

### Markdown (default)
Clean Markdown with aligned tables and GFM syntax.

### JSON
```json
{
  "markdown": "...",
  "metadata": { "title": "...", "description": "..." },
  "selector": "body",
  "stats": { "characters": 1234, "words": 200, "lines": 50 },
  "sourceUrl": "https://example.com",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Tips for RAG Developers

1. **Use specific selectors** to extract only content, avoiding navigation and ads:
   ```bash
   md4llm https://docs.example.com -s "article, .content, #main"
   ```

2. **Strip links** when you don't need them for cleaner embeddings:
   ```bash
   md4llm https://example.com --no-links
   ```

3. **Batch crawl documentation** sites:
   ```bash
   # Generate URL list
   echo "https://docs.example.com/intro" > urls.txt
   echo "https://docs.example.com/guide" >> urls.txt
   
   md4llm --batch urls.txt -o ./docs/
   ```

4. **JSON output for pipelines**:
   ```bash
   md4llm https://example.com --format json | jq '.markdown'
   ```
