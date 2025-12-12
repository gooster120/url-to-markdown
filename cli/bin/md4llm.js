#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const readline = require('readline');
const { JSDOM } = require('jsdom');
const { convert } = require('../lib/converter');
const { fetchUrl, fetchUrls } = require('../lib/fetcher');
const { getDomainFromUrl, sanitizeFilename } = require('../lib/utils');

const VERSION = require('../package.json').version;

program
    .name('md4llm')
    .description('HTML to Markdown converter optimized for LLM/RAG workflows')
    .version(VERSION)
    .argument('[input]', 'URL, file path, or - for stdin')
    .option('-o, --output <file>', 'Output file or directory (default: stdout)')
    .option('-s, --selector <css>', 'CSS selector to extract', 'body')
    .option('-f, --format <type>', 'Output format: md, json', 'md')
    .option('--no-clean', 'Disable noise removal')
    .option('--no-tables', 'Disable table alignment')
    .option('--no-links', 'Strip hyperlinks')
    .option('--strip-media', 'Remove images/video')
    .option('--meta', 'Include metadata extraction')
    .option('--batch <file>', 'Process URLs from file (one per line)')
    .option('--concurrency <n>', 'Batch concurrency limit', '3')
    .option('-i, --interactive', 'Interactive selector drilling mode')
    .option('-q, --quiet', 'Suppress progress output')
    .addHelpText('after', `
${chalk.bold('Examples:')}
  ${chalk.gray('# Convert a webpage')}
  md4llm https://example.com

  ${chalk.gray('# Extract specific section and save to file')}
  md4llm https://docs.python.org/3/tutorial/ -s "#content" -o tutorial.md

  ${chalk.gray('# Convert local HTML file')}
  md4llm page.html --format json

  ${chalk.gray('# Pipe HTML from stdin')}
  curl -s https://example.com | md4llm -

  ${chalk.gray('# Batch process multiple URLs')}
  md4llm --batch urls.txt -o ./output/

  ${chalk.gray('# Interactive selector drilling')}
  md4llm https://example.com --interactive
`);

program.parse();

const options = program.opts();
const input = program.args[0];

function log(message, type = 'info') {
    if (options.quiet) return;

    const prefix = {
        info: chalk.blue('ℹ'),
        success: chalk.green('✓'),
        error: chalk.red('✗'),
        warn: chalk.yellow('⚠')
    };

    console.error(`${prefix[type] || prefix.info} ${message}`);
}

async function readInput(source) {
    if (source === '-') {
        return new Promise((resolve, reject) => {
            let data = '';
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', chunk => data += chunk);
            process.stdin.on('end', () => resolve({ html: data, isUrl: false }));
            process.stdin.on('error', reject);
        });
    }

    if (source.startsWith('http://') || source.startsWith('https://')) {
        log(`Fetching ${source}...`);
        const result = await fetchUrl(source);
        log(`Fetched ${(result.html.length / 1024).toFixed(1)} KB`, 'success');
        return { html: result.html, baseUrl: result.finalUrl, isUrl: true };
    }

    const filePath = path.resolve(source);
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    log(`Reading ${filePath}...`);
    const html = fs.readFileSync(filePath, 'utf8');
    return { html, isUrl: false };
}

function writeOutput(content, outputPath, isDirectory = false, filename = 'output') {
    if (!outputPath) {
        process.stdout.write(content);
        return;
    }

    let finalPath = outputPath;

    if (isDirectory) {
        if (!fs.existsSync(outputPath)) {
            fs.mkdirSync(outputPath, { recursive: true });
        }
        const ext = options.format === 'json' ? '.json' : '.md';
        finalPath = path.join(outputPath, sanitizeFilename(filename) + ext);
    }

    fs.writeFileSync(finalPath, content);
    log(`Saved to ${finalPath}`, 'success');
}

function formatResult(result, sourceUrl = null) {
    if (options.format === 'json') {
        const output = {
            ...result,
            sourceUrl,
            timestamp: new Date().toISOString(),
            options: {
                selector: options.selector,
                alignTables: options.tables,
                cleanNoise: options.clean,
                stripMedia: options.stripMedia,
                preserveLinks: options.links,
                extractMeta: options.meta
            }
        };
        return JSON.stringify(output, null, 2);
    }

    return result.markdown;
}

async function processSingle(source) {
    const { html, baseUrl, isUrl } = await readInput(source);

    const result = convert(html, {
        selector: options.selector,
        baseUrl: baseUrl || (isUrl ? source : null),
        alignTables: options.tables,
        cleanNoise: options.clean,
        stripMedia: options.stripMedia,
        preserveLinks: options.links,
        extractMeta: options.meta
    });

    log(`Converted: ${result.stats.characters.toLocaleString()} chars, ${result.stats.words.toLocaleString()} words`, 'success');

    const output = formatResult(result, isUrl ? source : null);
    writeOutput(output, options.output);
}

async function processBatch(batchFile) {
    if (!fs.existsSync(batchFile)) {
        throw new Error(`Batch file not found: ${batchFile}`);
    }

    const content = fs.readFileSync(batchFile, 'utf8');
    const urls = content
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.startsWith('http'));

    if (urls.length === 0) {
        throw new Error('No valid URLs found in batch file');
    }

    log(`Processing ${urls.length} URLs with concurrency ${options.concurrency}...`);

    const outputDir = options.output || './md4llm-output';

    const results = await fetchUrls(urls, {
        concurrency: parseInt(options.concurrency, 10),
        onProgress: (url, index, total, result) => {
            if (result.error) {
                log(`[${index + 1}/${total}] Failed: ${url} - ${result.error}`, 'error');
            } else {
                log(`[${index + 1}/${total}] Fetched: ${url}`, 'success');
            }
        }
    });

    let successCount = 0;
    for (const result of results) {
        if (result.error || !result.html) continue;

        try {
            const converted = convert(result.html, {
                selector: options.selector,
                baseUrl: result.finalUrl || result.url,
                alignTables: options.tables,
                cleanNoise: options.clean,
                stripMedia: options.stripMedia,
                preserveLinks: options.links,
                extractMeta: options.meta
            });

            const output = formatResult(converted, result.url);
            const filename = getDomainFromUrl(result.url) + '_' + Date.now();
            writeOutput(output, outputDir, true, filename);
            successCount++;
        } catch (error) {
            log(`Conversion failed for ${result.url}: ${error.message}`, 'error');
        }
    }

    log(`\nBatch complete: ${successCount}/${urls.length} URLs converted`, 'info');
}

function getChildElements(parentElement) {
    const children = [];

    parentElement.querySelectorAll(':scope > *').forEach((el, index) => {
        const tag = el.tagName.toLowerCase();

        if (['script', 'style', 'noscript', 'meta', 'link'].includes(tag)) return;

        let selector = tag;
        let label = tag;

        if (el.id) {
            selector = `#${el.id}`;
            label = `#${el.id}`;
        }
        else if (el.classList && el.classList.length > 0) {
            const mainClass = el.classList[0];
            selector = `.${mainClass}`;
            label = `.${mainClass}`;
        }
        else {
            selector = `${tag}:nth-child(${index + 1})`;
            label = `${tag}[${index + 1}]`;
        }

        let textPreview = (el.textContent || '').trim().slice(0, 40);
        if (textPreview.length >= 40) textPreview += '...';
        textPreview = textPreview.replace(/\s+/g, ' ');

        const childCount = el.querySelectorAll(':scope > *').length;

        children.push({
            element: el,
            selector,
            label,
            tag,
            textPreview,
            childCount,
            index: children.length
        });
    });

    return children;
}

async function processInteractive(source) {
    const { html, baseUrl, isUrl } = await readInput(source);

    const dom = new JSDOM(html);
    const doc = dom.window.document;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const ask = (question) => new Promise(resolve => rl.question(question, resolve));

    let currentElement = doc.body;
    let drillPath = [];

    console.log(chalk.cyan('\n=== Interactive Selector Drilling ===\n'));
    console.log(chalk.gray('Navigate through the DOM by selecting child elements.'));
    console.log(chalk.gray('Commands: number to drill, [b]ack, [a]ccept, [q]uit\n'));

    while (true) {
        const pathStr = drillPath.length > 0
            ? chalk.yellow('body > ' + drillPath.map(p => p.label).join(' > '))
            : chalk.yellow('body');
        console.log(chalk.white('\nCurrent: ') + pathStr);

        const children = getChildElements(currentElement);

        if (children.length === 0) {
            console.log(chalk.gray('  No child elements. Press [b] to go back or [a] to accept.'));
        } else {
            console.log(chalk.gray(`  ${children.length} child element(s):\n`));

            children.forEach((child, i) => {
                const countStr = child.childCount > 0 ? chalk.blue(` (${child.childCount} children)`) : '';
                const preview = child.textPreview ? chalk.gray(` "${child.textPreview}"`) : '';
                console.log(chalk.green(`  [${i}]`) + ` ${child.label}${countStr}${preview}`);
            });
        }

        console.log('');
        const input = await ask(chalk.cyan('Select: '));
        const cmd = input.trim().toLowerCase();

        if (cmd === 'q' || cmd === 'quit') {
            console.log(chalk.yellow('Aborted.'));
            rl.close();
            return;
        }

        if (cmd === 'b' || cmd === 'back') {
            if (drillPath.length > 0) {
                drillPath.pop();
                currentElement = doc.body;
                for (const step of drillPath) {
                    const found = currentElement.querySelector(step.selector);
                    if (found) currentElement = found;
                }
                console.log(chalk.gray('  Went back one level.'));
            } else {
                console.log(chalk.gray('  Already at root.'));
            }
            continue;
        }

        if (cmd === 'a' || cmd === 'accept') {
            rl.close();

            const finalSelector = drillPath.map(p => p.selector).join(' ') || 'body';
            console.log(chalk.green(`\nAccepted selector: ${finalSelector}`));

            const result = convert(currentElement.outerHTML, {
                selector: 'body',
                baseUrl: baseUrl || (isUrl ? source : null),
                alignTables: options.tables,
                cleanNoise: options.clean,
                stripMedia: options.stripMedia,
                preserveLinks: options.links,
                extractMeta: options.meta
            });

            result.selector = finalSelector;

            log(`Converted: ${result.stats.characters.toLocaleString()} chars, ${result.stats.words.toLocaleString()} words`, 'success');

            const output = formatResult(result, isUrl ? source : null);
            writeOutput(output, options.output);
            return;
        }

        const num = parseInt(cmd, 10);
        if (!isNaN(num) && num >= 0 && num < children.length) {
            const selected = children[num];
            drillPath.push({
                selector: selected.selector,
                label: selected.label
            });

            const found = currentElement.querySelector(selected.selector);
            if (found) {
                currentElement = found;
                console.log(chalk.gray(`  Drilled into: ${selected.label}`));
            }
        } else if (cmd !== '') {
            console.log(chalk.red('  Invalid input. Enter a number, [b]ack, [a]ccept, or [q]uit.'));
        }
    }
}

async function main() {
    try {
        if (options.batch) {
            await processBatch(options.batch);
            return;
        }

        if (!input) {
            program.help();
            return;
        }

        if (options.interactive) {
            await processInteractive(input);
            return;
        }

        await processSingle(input);

    } catch (error) {
        log(error.message, 'error');
        process.exit(1);
    }
}

main();
