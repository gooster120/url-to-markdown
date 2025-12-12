const CORS_PROXIES = [
    'https://api.allorigins.win/raw?url=',
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest='
];

let currentProxyIndex = 0;
let conversionResult = null;
let extractedSelectors = { ids: [], classes: [], tags: [] };
let currentFilter = 'all';
let lastUsedSelector = 'body';
let originalDocHead = null;

// Drill mode state (simplified)
let currentDrillParent = null; // Current parent selector for showing children
let drillOriginalHtml = null;

const turndownService = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*'
});

turndownService.use(turndownPluginGfm.gfm);

turndownService.addRule('cleanSpans', {
    filter: ['span', 'font', 'small'],
    replacement: content => content
});

// Custom rule to handle complex tables (e.g., from MS Word/SharePoint)
turndownService.addRule('cleanComplexTables', {
    filter: function (node) {
        return node.nodeName === 'TABLE';
    },
    replacement: function (content, node) {
        // Extract clean table data from complex HTML tables
        const rows = [];
        const tableRows = node.querySelectorAll('tr');

        tableRows.forEach(tr => {
            const cells = [];
            tr.querySelectorAll('td, th').forEach(cell => {
                // Extract just the text content, stripping all nested elements
                let text = cell.textContent.trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|');
                cells.push(text);
            });
            if (cells.length > 0) {
                rows.push(cells);
            }
        });

        if (rows.length === 0) return '';

        // Determine column count
        const colCount = Math.max(...rows.map(r => r.length));

        // Build Markdown table
        let md = '\n\n';
        rows.forEach((row, idx) => {
            // Pad row to have consistent columns
            while (row.length < colCount) row.push('');
            md += '| ' + row.join(' | ') + ' |\n';
            // Add separator after header row
            if (idx === 0) {
                md += '| ' + row.map(() => '---').join(' | ') + ' |\n';
            }
        });
        md += '\n';

        return md;
    }
});

const DEMO_HTML = `<!DOCTYPE html>
<html>
<head>
    <title>Understanding Large Language Models</title>
    <meta name="description" content="A comprehensive guide to LLMs and their applications">
    <meta name="author" content="AI Research Team">
    <meta name="keywords" content="LLM, AI, machine learning, NLP">
</head>
<body>
<article class="main-content">
    <header>
        <h1>Understanding Large Language Models</h1>
        <p class="meta">Published: 2024-01-15 | Reading time: 5 min</p>
    </header>

    <section id="introduction">
        <h2>Introduction</h2>
        <p>Large Language Models (LLMs) have revolutionized <strong>natural language processing</strong>. This guide covers the key concepts, architectures, and practical applications.</p>
        <blockquote>
            "The development of LLMs represents one of the most significant advances in AI history."
        </blockquote>
    </section>

    <section id="comparison">
        <h2>Model Comparison</h2>
        <table>
            <thead>
                <tr>
                    <th>Model</th>
                    <th>Developer</th>
                    <th>Parameters</th>
                    <th>Context</th>
                </tr>
            </thead>
            <tbody>
                <tr><td>GPT-4</td><td>OpenAI</td><td>1.76T</td><td>128k</td></tr>
                <tr><td>Claude 3</td><td>Anthropic</td><td>Unknown</td><td>200k</td></tr>
                <tr><td>Llama 3</td><td>Meta</td><td>405B</td><td>128k</td></tr>
                <tr><td>Gemini</td><td>Google</td><td>Unknown</td><td>1M</td></tr>
            </tbody>
        </table>
    </section>

    <section id="code">
        <h2>API Example</h2>
        <pre><code class="language-python">from openai import OpenAI

client = OpenAI()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "Explain transformers."}
    ]
)
print(response.choices[0].message.content)</code></pre>
    </section>

    <section id="links">
        <h2>Resources</h2>
        <ul>
            <li><a href="/docs/getting-started">Getting Started Guide</a></li>
            <li><a href="https://arxiv.org/papers">Research Papers</a></li>
            <li><a href="#faq">FAQ Section</a></li>
        </ul>
    </section>

    <footer class="noise">
        <p>© 2024 AI Research. Subscribe to newsletter!</p>
    </footer>
</article>
<div class="advertisement">Buy our course!</div>
<nav class="sidebar">Navigation menu</nav>
</body>
</html>`;

async function fetchURL() {
    const urlInput = document.getElementById('url-input');
    const url = urlInput.value.trim();

    if (!url) {
        showToast('Please enter a URL', 'error');
        return false;
    }

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showToast('URL must start with http:// or https://', 'error');
        return false;
    }

    showLoading('Fetching URL...');

    for (let i = 0; i < CORS_PROXIES.length; i++) {
        const proxyIndex = (currentProxyIndex + i) % CORS_PROXIES.length;
        const proxyUrl = CORS_PROXIES[proxyIndex] + encodeURIComponent(url);

        try {
            const response = await fetch(proxyUrl, {
                headers: { 'Accept': 'text/html' }
            });

            if (response.ok) {
                const html = await response.text();
                document.getElementById('html-input').value = html;
                document.getElementById('input-status').textContent = `Fetched ${(html.length / 1024).toFixed(1)}KB`;
                currentProxyIndex = proxyIndex;
                hideLoading();
                showToast('URL fetched successfully');
                updateInputStats();

                // Clear drill state from previous fetch
                drillOriginalHtml = null;
                currentDrillParent = null;
                originalDocHead = null;
                lastUsedSelector = 'body';
                document.getElementById('drill-path-display').classList.add('hidden');
                const searchInput = document.getElementById('selector-search');
                if (searchInput) searchInput.value = '';

                extractSelectorsFromHTML(html);
                return true;
            }
        } catch (e) {
            continue;
        }
    }

    hideLoading();
    showToast('Failed to fetch URL. Try pasting HTML directly.', 'error');
    return false;
}

async function processHTML() {
    let rawHtml = document.getElementById('html-input').value;
    const selector = document.getElementById('selector-input').value || 'body';
    const baseUrl = document.getElementById('url-input').value.trim();

    const doAlignTables = document.getElementById('align-tables').checked;
    const doRemoveMedia = document.getElementById('remove-media').checked;
    const doCleanNoise = document.getElementById('clean-noise').checked;
    const doExtractMeta = document.getElementById('extract-meta').checked;
    const doPreserveLinks = document.getElementById('preserve-links').checked;

    if (!rawHtml.trim() && baseUrl) {
        const fetched = await fetchURL();
        if (!fetched) return;
        rawHtml = document.getElementById('html-input').value;
    }

    if (!rawHtml.trim()) {
        showToast('Please paste HTML or enter a URL to fetch', 'error');
        return;
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    // Extract metadata - try from original doc head if we have it, otherwise from current HTML
    let metadata = {};
    if (doExtractMeta) {
        if (originalDocHead) {
            // Create a temporary doc with the original head for metadata extraction
            const tempDoc = parser.parseFromString(`<html><head>${originalDocHead}</head><body></body></html>`, 'text/html');
            metadata = extractMetadata(tempDoc);
        } else {
            metadata = extractMetadata(doc);
        }
    }

    if (baseUrl) {
        try {
            const base = new URL(baseUrl);
            doc.querySelectorAll('a[href], img[src]').forEach(tag => {
                if (tag.hasAttribute('href')) {
                    try {
                        tag.setAttribute('href', new URL(tag.getAttribute('href'), base).href);
                    } catch (e) { }
                }
                if (tag.hasAttribute('src')) {
                    try {
                        tag.setAttribute('src', new URL(tag.getAttribute('src'), base).href);
                    } catch (e) { }
                }
            });
        } catch (e) { }
    }

    let targetElement = doc.querySelector(selector);
    if (!targetElement) {
        showToast(`Selector "${selector}" not found, using body`, 'warning');
        targetElement = doc.body;
    }

    let cleanNode = targetElement.cloneNode(true);

    if (doCleanNoise) {
        const noiseSelectors = [
            'script', 'style', 'noscript', 'iframe', 'svg',
            '.ad', '.ads', '.advertisement', '.social-share',
            '.nav', 'nav', 'footer', '.footer',
            'header:not(article header)', '.sidebar', '.cookie-banner',
            '.popup', '.modal', '[role="banner"]', '[role="navigation"]',
            '.comments', '#comments', '.related-posts'
        ];
        noiseSelectors.forEach(sel => {
            try {
                cleanNode.querySelectorAll(sel).forEach(el => el.remove());
            } catch (e) { }
        });
        cleanNode.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden]').forEach(el => el.remove());
    }

    if (doRemoveMedia) {
        cleanNode.querySelectorAll('img, video, audio, picture, figure, canvas').forEach(el => {
            if (el.tagName === 'IMG' && el.alt) {
                const span = document.createElement('span');
                span.textContent = `[Image: ${el.alt}]`;
                el.parentNode.replaceChild(span, el);
            } else {
                el.remove();
            }
        });
    }

    if (!doPreserveLinks) {
        cleanNode.querySelectorAll('a').forEach(a => {
            const span = document.createElement('span');
            span.textContent = a.textContent;
            a.parentNode.replaceChild(span, a);
        });
    }

    let markdown = turndownService.turndown(cleanNode.innerHTML);

    if (doAlignTables) {
        markdown = alignMarkdownTables(markdown);
    }

    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    // Determine actual selector used
    const actualSelector = (lastUsedSelector !== 'body' && selector === 'body') ? lastUsedSelector : selector;

    conversionResult = {
        markdown: markdown,
        metadata: metadata,
        sourceUrl: baseUrl || null,
        selector: actualSelector,
        timestamp: new Date().toISOString(),
        options: {
            alignTables: doAlignTables,
            removeMedia: doRemoveMedia,
            cleanNoise: doCleanNoise,
            extractMeta: doExtractMeta,
            preserveLinks: doPreserveLinks
        }
    };

    document.getElementById('markdown-output').value = markdown;
    updateStats(markdown);
    updatePreview(markdown);
    updateJSON();
}

function extractMetadata(doc) {
    const meta = {};

    const title = doc.querySelector('title');
    if (title) meta.title = title.textContent.trim();

    const metaTags = ['description', 'author', 'keywords', 'og:title', 'og:description', 'og:image', 'twitter:title', 'twitter:description'];
    metaTags.forEach(name => {
        const el = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        if (el) {
            const key = name.replace(':', '_');
            meta[key] = el.getAttribute('content');
        }
    });

    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical) meta.canonical = canonical.getAttribute('href');

    const h1 = doc.querySelector('h1');
    if (h1) meta.h1 = h1.textContent.trim();

    return meta;
}

function alignMarkdownTables(md) {
    const lines = md.split('\n');
    let inTable = false;
    let tableBuffer = [];
    let result = [];

    for (let line of lines) {
        if (line.trim().startsWith('|')) {
            inTable = true;
            tableBuffer.push(line.trim());
        } else {
            if (inTable) {
                result.push(formatTable(tableBuffer));
                tableBuffer = [];
                inTable = false;
            }
            result.push(line);
        }
    }

    if (inTable) {
        result.push(formatTable(tableBuffer));
    }

    return result.join('\n');
}

function formatTable(rows) {
    const matrix = rows.map(row =>
        row.split('|').map(c => c.trim()).filter((_, i, a) => i > 0 && i < a.length - 1)
    );

    if (matrix.length === 0) return rows.join('\n');

    const colWidths = matrix[0].map((_, col) => {
        return Math.max(3, ...matrix.map(row => (row[col] ? row[col].length : 0)));
    });

    return matrix.map(row => {
        const isSep = row[0] && row[0].match(/^[:\-\s]+$/);
        const cells = row.map((cell, i) =>
            isSep ? '-'.repeat(colWidths[i]) : (cell || '').padEnd(colWidths[i], ' ')
        );
        return `| ${cells.join(' | ')} |`;
    }).join('\n');
}

function updateStats(text) {
    document.getElementById('char-count').textContent = text.length.toLocaleString();
}

function updateInputStats() {
    const html = document.getElementById('html-input').value;
    document.getElementById('input-char-count').textContent = `${html.length.toLocaleString()} chars`;
}

function updatePreview(md) {
    marked.use({ breaks: true, gfm: true });
    const preview = document.getElementById('view-preview');
    preview.innerHTML = marked.parse(md || '');
}

function updateJSON() {
    if (!conversionResult) return;

    const output = {
        ...conversionResult,
        stats: {
            characters: conversionResult.markdown.length,
            words: conversionResult.markdown.split(/\s+/).filter(w => w).length,
            lines: conversionResult.markdown.split('\n').length
        }
    };

    document.getElementById('json-output').value = JSON.stringify(output, null, 2);
}

function switchTab(tab) {
    const tabs = ['markdown', 'preview', 'json'];

    tabs.forEach(t => {
        const view = document.getElementById(`view-${t}`);
        const btn = document.getElementById(`tab-btn-${t}`);
        if (t === tab) {
            view.classList.remove('hidden');
            btn.classList.add('active');
        } else {
            view.classList.add('hidden');
            btn.classList.remove('active');
        }
    });

    if (tab === 'preview') {
        updatePreview(document.getElementById('markdown-output').value);
    }
}

function copyToClipboard() {
    const currentTab = document.querySelector('.tab-btn.active').id.replace('tab-btn-', '');
    let text = '';

    if (currentTab === 'markdown') {
        text = document.getElementById('markdown-output').value;
    } else if (currentTab === 'json') {
        text = document.getElementById('json-output').value;
    } else if (currentTab === 'preview') {
        text = document.getElementById('markdown-output').value;
    }

    if (text) {
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard');
    }
}

function downloadOutput() {
    const currentTab = document.querySelector('.tab-btn.active').id.replace('tab-btn-', '');
    let content, filename, type;

    if (currentTab === 'json') {
        content = document.getElementById('json-output').value;
        filename = 'content.json';
        type = 'application/json';
    } else {
        content = document.getElementById('markdown-output').value;
        filename = 'content.md';
        type = 'text/markdown';
    }

    const blob = new Blob([content], { type });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function loadDemo() {
    document.getElementById('html-input').value = DEMO_HTML;
    document.getElementById('selector-input').value = '.main-content';
    document.getElementById('url-input').value = 'https://example.com/article';
    document.getElementById('extract-meta').checked = true;
    document.getElementById('input-status').textContent = 'Demo loaded';
    processHTML();
}

function clearInput() {
    document.getElementById('html-input').value = '';
    document.getElementById('input-status').textContent = '';
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const content = document.getElementById('toast-content');
    const messageEl = document.getElementById('toast-message');

    content.className = 'px-3 py-2 rounded-lg shadow-xl flex items-center gap-2 text-sm ';
    if (type === 'error') {
        content.className += 'bg-red-500 text-white';
    } else if (type === 'warning') {
        content.className += 'bg-amber-500 text-white';
    } else {
        content.className += 'bg-emerald-500 text-white';
    }

    messageEl.textContent = message;
    toast.classList.remove('translate-y-20', 'opacity-0');

    setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0');
    }, 2500);
}

function showLoading(text = 'Loading...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading-overlay').classList.remove('hidden');
    document.getElementById('loading-overlay').classList.add('flex');
}

function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
    document.getElementById('loading-overlay').classList.remove('flex');
}

function showHelp() {
    document.getElementById('help-modal').classList.remove('hidden');
    document.getElementById('help-modal').classList.add('flex');
}

function hideHelp() {
    document.getElementById('help-modal').classList.add('hidden');
    document.getElementById('help-modal').classList.remove('flex');
}

document.addEventListener('keydown', (e) => {
    if (e.key === '?' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        showHelp();
    }

    if (e.key === 'Escape') {
        hideHelp();
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        processHTML();
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        copyToClipboard();
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'F') {
        e.preventDefault();
        fetchURL();
    }

    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'X') {
        e.preventDefault();
        clearInput();
    }
});

document.getElementById('url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        fetchURL();
    }
});

document.getElementById('help-modal').addEventListener('click', (e) => {
    if (e.target.id === 'help-modal') {
        hideHelp();
    }
});

document.getElementById('html-input').addEventListener('input', () => {
    const html = document.getElementById('html-input').value;
    updateInputStats();
    if (html.trim()) {
        extractSelectorsFromHTML(html);
    }
});

function extractSelectorsFromHTML(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const ids = new Set();
    const classes = new Set();
    const tags = new Set();

    const contentTags = ['article', 'main', 'section', 'div', 'aside', 'header', 'footer', 'nav'];

    doc.body.querySelectorAll('*').forEach(el => {
        if (el.id) {
            ids.add(el.id);
        }

        el.classList.forEach(cls => {
            if (cls && !cls.match(/^(js-|is-|has-|ng-|v-|_)/)) {
                classes.add(cls);
            }
        });

        const tag = el.tagName.toLowerCase();
        if (contentTags.includes(tag)) {
            tags.add(tag);
        }
    });

    extractedSelectors = {
        ids: Array.from(ids).sort(),
        classes: Array.from(classes).sort(),
        tags: Array.from(tags).sort()
    };

    updateSelectorDatalist();
    showSelectorPanel();
}

function updateSelectorDatalist() {
    const datalist = document.getElementById('selector-list');
    datalist.innerHTML = '';

    extractedSelectors.ids.forEach(id => {
        const option = document.createElement('option');
        option.value = `#${id}`;
        datalist.appendChild(option);
    });

    extractedSelectors.classes.forEach(cls => {
        const option = document.createElement('option');
        option.value = `.${cls}`;
        datalist.appendChild(option);
    });

    extractedSelectors.tags.forEach(tag => {
        const option = document.createElement('option');
        option.value = tag;
        datalist.appendChild(option);
    });

    const dropdownBtn = document.getElementById('selector-dropdown-btn');
    if (extractedSelectors.ids.length || extractedSelectors.classes.length || extractedSelectors.tags.length) {
        dropdownBtn.classList.remove('hidden');
    } else {
        dropdownBtn.classList.add('hidden');
    }
}

function showSelectorPanel() {
    const total = extractedSelectors.ids.length + extractedSelectors.classes.length + extractedSelectors.tags.length;
    if (total === 0) return;

    document.getElementById('selector-panel').classList.remove('hidden');
    document.getElementById('selector-count').textContent = `(${total} found)`;
    renderSelectorItems();
}

function hideSelectorPanel() {
    document.getElementById('selector-panel').classList.add('hidden');
}

function toggleSelectorDropdown() {
    const panel = document.getElementById('selector-panel');
    if (panel.classList.contains('hidden')) {
        showSelectorPanel();
    } else {
        hideSelectorPanel();
    }
}

function filterSelectors(filter) {
    currentFilter = filter;

    document.querySelectorAll('.selector-filter').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });

    // Clear search when changing filter
    const searchInput = document.getElementById('selector-search');
    if (searchInput) searchInput.value = '';

    renderSelectorItems();
}

/**
 * Search/filter selectors by query
 */
function searchSelectors(query) {
    renderSelectorItems(query.toLowerCase().trim());
}

function renderSelectorItems(searchQuery = '') {
    const container = document.getElementById('selector-items');
    container.innerHTML = '';

    const addItem = (selector, type) => {
        // Apply search filter
        if (searchQuery && !selector.toLowerCase().includes(searchQuery)) {
            return;
        }

        const item = document.createElement('button');
        item.className = `selector-item ${type}`;
        item.textContent = selector;
        item.onclick = () => selectSelector(selector);
        container.appendChild(item);
    };

    if (currentFilter === 'all' || currentFilter === 'id') {
        extractedSelectors.ids.forEach(id => addItem(`#${id}`, 'id'));
    }

    if (currentFilter === 'all' || currentFilter === 'class') {
        extractedSelectors.classes.forEach(cls => addItem(`.${cls}`, 'class'));
    }

    if (currentFilter === 'all' || currentFilter === 'tag') {
        extractedSelectors.tags.forEach(tag => addItem(tag, 'tag'));
    }

    // Update count
    const count = container.children.length;
    document.getElementById('selector-count').textContent = `(${count})`;
}

function selectSelector(selector) {
    document.getElementById('selector-input').value = selector;

    const rawHtml = document.getElementById('html-input').value;
    if (rawHtml.trim()) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawHtml, 'text/html');
        const element = doc.querySelector(selector);

        if (element) {
            // Store the original document head for metadata extraction
            if (doc.head) {
                originalDocHead = doc.head.innerHTML;
            }
            // Store original HTML for drilling
            if (!drillOriginalHtml) {
                drillOriginalHtml = rawHtml;
            }
            // Track the selector used
            lastUsedSelector = currentDrillParent ? `${currentDrillParent} ${selector}` : selector;

            document.getElementById('html-input').value = element.outerHTML;
            updateInputStats();

            // Show children of this element
            showChildrenOf(selector, element);

            showToast(`Selected: ${selector}`);
        } else {
            showToast(`Selector "${selector}" not found`, 'warning');
        }
    }
}

/**
 * Show children of selected element in the selector panel
 */
function showChildrenOf(parentSelector, parentElement) {
    currentDrillParent = lastUsedSelector;

    const children = getChildElements(parentElement);

    // Update path display
    const pathDisplay = document.getElementById('drill-path-display');
    const pathText = document.getElementById('drill-path-text');

    if (children.length > 0) {
        pathDisplay.classList.remove('hidden');
        pathDisplay.classList.add('flex');
        pathText.textContent = currentDrillParent;

        // Show children in selector items
        const container = document.getElementById('selector-items');
        container.innerHTML = '';

        children.forEach(child => {
            const item = document.createElement('button');
            item.className = `selector-item ${child.hasId ? 'id' : child.hasClass ? 'class' : 'tag'}`;

            let text = child.label;
            if (child.childCount > 0) {
                text += ` (${child.childCount})`;
            }
            item.textContent = text;
            item.title = child.textPreview || 'No text content';

            item.onclick = () => selectSelector(child.selector);
            container.appendChild(item);
        });

        document.getElementById('selector-count').textContent = `(${children.length} children)`;
    } else {
        pathDisplay.classList.add('hidden');
        hideSelectorPanel();
    }
}

/**
 * Reset drill path and show all selectors again
 */
function resetDrillPath() {
    currentDrillParent = null;

    // Restore original HTML
    if (drillOriginalHtml) {
        document.getElementById('html-input').value = drillOriginalHtml;
        updateInputStats();
        extractSelectorsFromHTML(drillOriginalHtml);
        drillOriginalHtml = null;
    }

    // Hide path display
    document.getElementById('drill-path-display').classList.add('hidden');

    // Show normal selectors
    renderSelectorItems();
    showToast('Showing all selectors');
}

/**
 * Get child elements of an element
 */
function getChildElements(parentElement) {
    const children = [];

    parentElement.querySelectorAll(':scope > *').forEach((el, index) => {
        const tag = el.tagName.toLowerCase();

        // Skip non-content elements
        if (['script', 'style', 'noscript', 'meta', 'link'].includes(tag)) return;

        let selector = tag;
        let label = tag;

        // Prefer ID if available
        if (el.id) {
            selector = `#${el.id}`;
            label = `#${el.id}`;
        }
        // Then class
        else if (el.classList.length > 0) {
            const mainClass = el.classList[0];
            selector = `.${mainClass}`;
            label = `.${mainClass}`;
        }
        // Fall back to nth-child for duplicates
        else {
            selector = `${tag}:nth-child(${index + 1})`;
            label = `${tag}[${index + 1}]`;
        }

        // Get text preview
        let textPreview = el.textContent.trim().slice(0, 30);
        if (textPreview.length >= 30) textPreview += '...';

        const childCount = el.querySelectorAll(':scope > *').length;

        children.push({
            element: el,
            selector,
            label,
            tag,
            textPreview,
            childCount,
            hasId: !!el.id,
            hasClass: el.classList.length > 0
        });
    });

    return children;
}


