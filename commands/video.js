const axios = require('axios');
const yts = require('yt-search');

const API_BASE = 'https://jawad-tech.vercel.app/download/ytdl?url=';

const AXIOS_DEFAULTS = {
    timeout: 60000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
    }
};

// Prevents the same message from being processed twice (spam loop guard)
const inProgress = new Set();

async function tryRequest(getter, attempts = 2) {
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await getter();
        } catch (err) {
            lastError = err;
            if (attempt < attempts) await new Promise(r => setTimeout(r, 1500));
        }
    }
    throw lastError;
}

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

function findTitle(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (typeof obj.title === 'string' && obj.title.trim()) return obj.title.trim();
    for (const k of Object.keys(obj)) {
        if (obj[k] && typeof obj[k] === 'object') {
            const t = findTitle(obj[k]);
            if (t) return t;
        }
    }
    return null;
}

function pickVideoLink(data) {
    const links = collectLinks(data).filter(l => !/thumb|image|cover|poster|avatar|icon/.test(l.path) && !/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(l.url));
    const score = (l) => {
        let s = 0;
        if (/mp4/.test(l.path)) s += 5;
        if (/video/.test(l.path)) s += 3;
        if (/download|dl/.test(l.path)) s += 2;
        if (/\.mp4(\?|$)/i.test(l.url)) s += 2;
        if (/mp3|audio/.test(l.path)) s -= 6;
        return s;
    };
    links.sort((a, b) => score(b) - score(a));
    return links[0]?.url || null;
}

async function getVideoFromApi(youtubeUrl) {
    const apiUrl = `${API_BASE}${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    const data = res?.data;
    if (!data) throw new Error('Empty API response');
    const download = pickVideoLink(data);
    if (!download) throw new Error('API returned no video link');
    return { download, title: findTitle(data) };
}

async function videoCommand(sock, chatId, message) {
    const lockKey = `${chatId}:${message.key?.id}`;
    if (inProgress.has(lockKey)) return;
    inProgress.add(lockKey);

    try {
        const messageContent = message.message?.ephemeralMessage?.message || message.message?.viewOnceMessage?.message || message.message?.viewOnceMessageV2?.message || message.message;
        const text = (messageContent?.conversation || messageContent?.extendedTextMessage?.text || messageContent?.imageMessage?.caption || messageContent?.videoMessage?.caption || '').trim();
        // Remove the command word (works with any prefix)
        const query = text.replace(/^\S+\s*/, '').trim();

        if (!query) {
            await sock.sendMessage(chatId, { text: 'Usage: .video <name or link>' }, { quoted: message });
            return;
        }

        // Single loading reaction (instead of 3 in a row)
        try { await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }); } catch (e) {}

        let videoUrl = '';
        let videoTitle = '';
        let videoThumbnail = '';

        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            videoUrl = query;
            videoTitle = 'YouTube Video';
        } else {
            const { videos } = await yts(query);
            if (!videos || videos.length === 0) {
                await sock.sendMessage(chatId, { text: 'No videos found!' }, { quoted: message });
                return;
            }
            videoUrl = videos[0].url;
            videoTitle = videos[0].title;
            videoThumbnail = videos[0].thumbnail;
        }

        await sock.sendMessage(chatId, {
            image: { url: videoThumbnail || 'https://i.postimg.cc/y6GV9P3H/file-000000004c307206bc366893b817568c-(1).png' },
            caption: `🎥 Downloading: *${videoTitle}*`
        }, { quoted: message });

        const videoData = await getVideoFromApi(videoUrl);
        const finalTitle = videoData.title || videoTitle || 'video';
        const safeName = finalTitle.replace(/[^\w\s-]/g, '').trim() || 'video';

        await sock.sendMessage(chatId, {
            video: { url: videoData.download },
            mimetype: 'video/mp4',
            fileName: `${safeName}.mp4`,
            caption: `*${finalTitle}*\n\n> *Downloaded By 𝐈𝐁𝐑𝐀𝐇𝐈𝐌 𝐌𝐃 𝐁𝐎𝐓🚀*`
        }, { quoted: message });

        try { await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }); } catch (e) {}

    } catch (error) {
        console.error('Video error:', error);
        await sock.sendMessage(chatId, { text: `❌ Error: ${error.message}` }, { quoted: message });
    } finally {
        setTimeout(() => inProgress.delete(lockKey), 30000);
    }
}

module.exports = videoCommand;
