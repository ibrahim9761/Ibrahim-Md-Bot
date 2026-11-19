const axios = require('axios');
const yts = require('yt-search');
const { toAudio } = require('../lib/converter');

const API_BASE = 'https://yt-dl.officialhectormanuel.workers.dev/?url=';

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

function pickAudioLink(data) {
    const links = collectLinks(data).filter(l => !/thumb|image|cover|poster|avatar|icon/.test(l.path) && !/^https?:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//i.test(l.url));
    const score = (l) => {
        let s = 0;
        if (/mp3/.test(l.path)) s += 5;
        if (/audio/.test(l.path)) s += 4;
        if (/download|dl/.test(l.path)) s += 2;
        if (/\.mp3(\?|$)/i.test(l.url)) s += 2;
        if (/mp4|video/.test(l.path)) s -= 4;
        return s;
    };
    links.sort((a, b) => score(b) - score(a));
    return links[0]?.url || null;
}

async function getAudioFromApi(youtubeUrl) {
    const apiUrl = `${API_BASE}${encodeURIComponent(youtubeUrl)}`;
    const res = await tryRequest(() => axios.get(apiUrl, AXIOS_DEFAULTS));
    const data = res?.data;
    if (!data) throw new Error('Empty API response');
    const download = pickAudioLink(data);
    if (!download) throw new Error('API returned no audio link');
    return { download, title: findTitle(data) };
}

async function songCommand(sock, chatId, message) {
    const lockKey = `${chatId}:${message.key?.id}`;
    if (inProgress.has(lockKey)) return;
    inProgress.add(lockKey);

    try {
        const messageContent = message.message?.ephemeralMessage?.message || message.message?.viewOnceMessage?.message || message.message?.viewOnceMessageV2?.message || message.message;
        const text = (messageContent?.conversation || messageContent?.extendedTextMessage?.text || messageContent?.imageMessage?.caption || messageContent?.videoMessage?.caption || '').trim();
        // Remove the command word (works with any prefix)
        const query = text.replace(/^\S+\s*/, '').trim();

        if (!query) {
            await sock.sendMessage(chatId, { text: 'Usage: .song <song name or YouTube link>' }, { quoted: message });
            return;
        }

        // Single loading reaction (instead of 3 in a row)
        try { await sock.sendMessage(chatId, { react: { text: '⏳', key: message.key } }); } catch (e) {}

        let video;
        if (query.includes('youtube.com') || query.includes('youtu.be')) {
            video = { url: query, title: 'YouTube Audio', thumbnail: 'https://i.postimg.cc/y6GV9P3H/file-000000004c307206bc366893b817568c-(1).png' };
        } else {
            const search = await yts(query);
            if (!search || !search.videos.length) {
                await sock.sendMessage(chatId, { text: 'No results found.' }, { quoted: message });
                return;
            }
            video = search.videos[0];
        }

        await sock.sendMessage(chatId, {
            image: { url: video.thumbnail },
            caption: `🎵 Downloading: *${video.title}*\n⏱ Duration: ${video.timestamp || 'N/A'}`
        }, { quoted: message });

        const audioData = await getAudioFromApi(video.url);
        const finalTitle = audioData.title || video.title || 'song';

        const audioResponse = await axios.get(audioData.download, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': '*/*' }
        });
        const audioBuffer = Buffer.from(audioResponse.data);

        if (!audioBuffer || audioBuffer.length < 1000) {
            throw new Error('Downloaded audio file is empty or invalid.');
        }

        // Detect format and convert if needed
        let fileExtension = 'mp3';
        const head4 = audioBuffer.toString('ascii', 0, 4);
        if (audioBuffer.slice(4, 8).toString('ascii') === 'ftyp') fileExtension = 'm4a';
        else if (head4 === 'OggS') fileExtension = 'ogg';
        else if (head4 === 'RIFF') fileExtension = 'wav';

        let finalBuffer = audioBuffer;
        if (fileExtension !== 'mp3') {
            finalBuffer = await toAudio(audioBuffer, fileExtension);
        }

        await sock.sendMessage(chatId, {
            audio: finalBuffer,
            mimetype: 'audio/mpeg',
            fileName: `${(finalTitle.replace(/[^\w\s-]/g, '').trim() || 'song')}.mp3`,
            ptt: false
        }, { quoted: message });

        try { await sock.sendMessage(chatId, { react: { text: '✅', key: message.key } }); } catch (e) {}

    } catch (err) {
        console.error('Song command error:', err);
        await sock.sendMessage(chatId, { text: `❌ Error: ${err.message}` }, { quoted: message });
    } finally {
        setTimeout(() => inProgress.delete(lockKey), 30000);
    }
}

module.exports = songCommand;
