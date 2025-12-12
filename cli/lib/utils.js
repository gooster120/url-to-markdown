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

function isValidSelector(selector) {
    try {
        return /^[a-zA-Z0-9\-_#.\[\]="':,\s*>+~()]+$/.test(selector);
    } catch (e) {
        return false;
    }
}

function sanitizeFilename(name) {
    return name
        .replace(/[^a-zA-Z0-9\-_]/g, '_')
        .replace(/_+/g, '_')
        .substring(0, 100);
}

function getDomainFromUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '');
    } catch (e) {
        return 'output';
    }
}

module.exports = {
    alignMarkdownTables,
    formatTable,
    isValidSelector,
    sanitizeFilename,
    getDomainFromUrl
};
