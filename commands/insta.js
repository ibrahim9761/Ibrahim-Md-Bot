const axios = require('axios');

const API_BASE = 'https://api.nexoracle.com/downloader/insta2?apikey=d0dbeb860362981c53&url=';

// Prevents the same message from being processed twice (spam loop guard)
const inProgress = new Set();

// Walks any JSON response and collects every http(s) link with its key path
function collectLinks(obj, path = '', out = []) {
    if (obj == null) return out;
    if (typeof obj === 'string') {
        if (/^https?:\/\//i.test(obj)) out.push({ path: path.toLowerCase(), url: obj });
    } else if (Array.isArray(obj)) {
        obj.forEach((v, i) => collectLinks(v, `${path}.${i}`, out));
    } else if (typeof obj === 'object') {
        for (const k of Object.keys(obj)) collectLinks(obj[k], `${path}.${k}`, out);
    }
    return out;
}

// Works with any response shape (array of urls, array of objects, nested result/data/media)
function extractItems(data) {
    const links = collectLinks(data).filter(l =>
        !/thumb|cover|poster|avatar|icon|profile|preview/.test(l.path) &&
        !/^https?:\/\/(www\.)?instagram\.com\//i.test(l.url)
    );
    const seen = new Set();
    const items = [];
    for (const l of links) {
        if (seen.has(l.url)) continue;
        seen.add(l.url);
        const isVideo = /video|mp4|reel/.test(l.path) || /\.mp4(\?|$)/i.test(l.url);
        items.push({ url: l.url, isVideo });
    }
    return items;
}

async function instaCommand(sock, from, msg, q) {
    if (!q) return await sock.sendMessage(from, { text: '❌ Please provide an Instagram URL.' }, { quoted: msg });

    const lockKey = `${from}:${msg.key?.id}`;
    if (inProgress.has(lockKey)) return;
    inProgress.add(lockKey);

    try {
        try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }); } catch (e) {}

        const apiUrl = `${API_BASE}${encodeURIComponent(q.trim())}`;
        const response = await axios.get(apiUrl, {
            timeout: 60000,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json, text/plain, */*' }
        });

        const items = extractItems(response.data).slice(0, 10);
        if (items.length === 0) throw new Error('No media found or link is private.');

        const caption = `*\u{1F4F7} Instagram Downloader*\n\n> © POWERED BY SHADOW MD BOT`;

        for (const item of items) {
            if (item.isVideo) {
                await sock.sendMessage(from, {
                    video: { url: item.url },
                    caption,
                    mimetype: 'video/mp4'
                }, { quoted: msg });
            } else {
                await sock.sendMessage(from, {
                    image: { url: item.url },
                    caption
                }, { quoted: msg });
            }
        }

        try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch (e) {}
    } catch (e) {
        console.error('Instagram Error:', e);
        await sock.sendMessage(from, { text: '❌ Error downloading Instagram content: ' + e.message }, { quoted: msg });
        try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch (err) {}
    } finally {
        setTimeout(() => inProgress.delete(lockKey), 30000);
    }
}

module.exports = instaCommand;
