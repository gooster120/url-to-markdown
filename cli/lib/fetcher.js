const axios = require('axios');

const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

async function fetchUrl(url, options = {}) {
    const { timeout = 30000, retries = 2 } = options;

    let lastError;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await axios.get(url, {
                timeout,
                maxRedirects: 5,
                headers: {
                    'User-Agent': USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'gzip, deflate',
                    'Connection': 'keep-alive',
                    'Upgrade-Insecure-Requests': '1'
                },
                responseType: 'text',
                validateStatus: (status) => status >= 200 && status < 400
            });

            return {
                html: response.data,
                finalUrl: response.request?.res?.responseUrl || url,
                status: response.status
            };
        } catch (error) {
            lastError = error;

            if (error.response && error.response.status >= 400 && error.response.status < 500 && error.response.status !== 429) {
                throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`);
            }

            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
            }
        }
    }

    throw new Error(`Failed to fetch URL after ${retries + 1} attempts: ${lastError.message}`);
}

async function fetchUrls(urls, options = {}) {
    const { concurrency = 3, onProgress } = options;
    const results = [];
    const queue = [...urls];
    let index = 0;

    async function processNext() {
        if (queue.length === 0) return;

        const url = queue.shift();
        const currentIndex = index++;

        try {
            const result = await fetchUrl(url, options);
            const output = { url, ...result };
            results[currentIndex] = output;
            if (onProgress) onProgress(url, currentIndex, urls.length, output);
        } catch (error) {
            const output = { url, error: error.message };
            results[currentIndex] = output;
            if (onProgress) onProgress(url, currentIndex, urls.length, output);
        }

        await processNext();
    }

    const workers = [];
    for (let i = 0; i < Math.min(concurrency, urls.length); i++) {
        workers.push(processNext());
    }

    await Promise.all(workers);
    return results;
}

module.exports = {
    fetchUrl,
    fetchUrls
};
