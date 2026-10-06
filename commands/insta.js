const axios = require('axios');

const API_BASE = 'https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=';

// Prevents the same message from being processed twice (spam loop guard)
const inProgress = new Set();

function extractItems(data) {
    // Supports { data: [...] }, { result: [...] }, { data: {...} } and plain arrays
    let list = data?.data ?? data?.result ?? data;
    if (!list) return [];
    if (!Array.isArray(list)) {
        if (Array.isArray(list.media)) list = list.media;
        else if (Array.isArray(list.url)) list = list.url.map(u => (typeof u === 'string' ? { url: u } : u));
        else list = [list];
    }
    const seen = new Set();
    const items = [];
    for (const it of list) {
        const obj = typeof it === 'string' ? { url: it } : it;
        const url = obj?.url || obj?.download_url || obj?.download || obj?.link;
        if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
        if (seen.has(url)) continue;
        seen.add(url);
        items.push({ url, type: String(obj.type || '').toLowerCase() });
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
            const isVideo = item.type === 'video' || /\.mp4(\?|$)/i.test(item.url);
            if (isVideo) {
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
