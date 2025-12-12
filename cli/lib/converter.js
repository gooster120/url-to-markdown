const TurndownService = require('turndown');
const { gfm } = require('@joplin/turndown-plugin-gfm');
const { JSDOM } = require('jsdom');
const { alignMarkdownTables } = require('./utils');

function createTurndownService() {
    const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
        emDelimiter: '*'
    });

    turndownService.use(gfm);

    turndownService.addRule('cleanSpans', {
        filter: ['span', 'font', 'small'],
        replacement: content => content
    });

    turndownService.addRule('cleanComplexTables', {
        filter: function (node) {
            return node.nodeName === 'TABLE';
        },
        replacement: function (content, node) {
            const rows = [];
            const tableRows = node.querySelectorAll('tr');

            Array.from(tableRows).forEach(tr => {
                const cells = [];
                Array.from(tr.querySelectorAll('td, th')).forEach(cell => {
                    let text = cell.textContent.trim().replace(/\s+/g, ' ').replace(/\|/g, '\\|');
                    cells.push(text);
                });
                if (cells.length > 0) {
                    rows.push(cells);
                }
            });

            if (rows.length === 0) return '';

            const colCount = Math.max(...rows.map(r => r.length));

            let md = '\n\n';
            rows.forEach((row, idx) => {
                while (row.length < colCount) row.push('');
                md += '| ' + row.join(' | ') + ' |\n';
                if (idx === 0) {
                    md += '| ' + row.map(() => '---').join(' | ') + ' |\n';
                }
            });
            md += '\n';

            return md;
        }
    });

    return turndownService;
}

const NOISE_SELECTORS = [
    'script', 'style', 'noscript', 'iframe', 'svg',
    '.ad', '.ads', '.advertisement', '.social-share',
    '.nav', 'nav', 'footer', '.footer',
    'header:not(article header)', '.sidebar', '.cookie-banner',
    '.popup', '.modal', '[role="banner"]', '[role="navigation"]',
    '.comments', '#comments', '.related-posts'
];

function extractMetadata(doc) {
    const meta = {};

    const title = doc.querySelector('title');
    if (title) meta.title = title.textContent.trim();

    const metaTags = [
        'description', 'author', 'keywords',
        'og:title', 'og:description', 'og:image',
        'twitter:title', 'twitter:description'
    ];

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

function cleanNoise(element) {
    NOISE_SELECTORS.forEach(sel => {
        try {
            Array.from(element.querySelectorAll(sel)).forEach(el => el.remove());
        } catch (e) { }
    });

    Array.from(element.querySelectorAll('[style*="display: none"], [style*="display:none"], [hidden]'))
        .forEach(el => el.remove());
}

function removeMedia(element) {
    Array.from(element.querySelectorAll('img, video, audio, picture, figure, canvas')).forEach(el => {
        if (el.tagName === 'IMG' && el.alt) {
            const span = element.ownerDocument.createElement('span');
            span.textContent = `[Image: ${el.alt}]`;
            el.parentNode.replaceChild(span, el);
        } else {
            el.remove();
        }
    });
}

function stripLinks(element) {
    Array.from(element.querySelectorAll('a')).forEach(a => {
        const span = element.ownerDocument.createElement('span');
        span.textContent = a.textContent;
        a.parentNode.replaceChild(span, a);
    });
}

function resolveUrls(element, baseUrl) {
    try {
        const base = new URL(baseUrl);
        Array.from(element.querySelectorAll('a[href], img[src]')).forEach(tag => {
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

function convert(html, options = {}) {
    const {
        selector = 'body',
        baseUrl = null,
        alignTables = true,
        cleanNoise: doCleanNoise = true,
        stripMedia = false,
        preserveLinks = true,
        extractMeta = false
    } = options;

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    let metadata = {};
    if (extractMeta) {
        metadata = extractMetadata(doc);
    }

    if (baseUrl) {
        resolveUrls(doc.body, baseUrl);
    }

    let targetElement = doc.querySelector(selector);
    let selectorUsed = selector;

    if (!targetElement) {
        targetElement = doc.body;
        selectorUsed = 'body (fallback)';
    }

    const cleanNode = targetElement.cloneNode(true);

    if (doCleanNoise) {
        cleanNoise(cleanNode);
    }

    if (stripMedia) {
        removeMedia(cleanNode);
    }

    if (!preserveLinks) {
        stripLinks(cleanNode);
    }

    const turndownService = createTurndownService();
    let markdown = turndownService.turndown(cleanNode.innerHTML);

    if (alignTables) {
        markdown = alignMarkdownTables(markdown);
    }

    markdown = markdown.replace(/\n{3,}/g, '\n\n').trim();

    return {
        markdown,
        metadata,
        selector: selectorUsed,
        stats: {
            characters: markdown.length,
            words: markdown.split(/\s+/).filter(w => w).length,
            lines: markdown.split('\n').length
        }
    };
}

module.exports = {
    convert,
    extractMetadata,
    createTurndownService
};
