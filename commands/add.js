const { jidNormalizedUser } = require('@whiskeysockets/baileys');

module.exports = async function(sock, chatId, msg, isAdmin, q) {
    if (!isAdmin) return await sock.sendMessage(chatId, { text: '\u274C Only admin!' }, { quoted: msg });
    if (!q) return await sock.sendMessage(chatId, { text: '\u26A0\uFE0F .add 923xxxxxxxxxx' }, { quoted: msg });
    
    try {
        const number = q.replace(/\D/g, '');
        const userJid = number + '@s.whatsapp.net';
        await sock.groupParticipantsUpdate(chatId, [userJid], 'add');
        await sock.sendMessage(chatId, { text: `\u2705 Added +${number}` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(chatId, { text: '\u274C Failed to add: ' + e.message }, { quoted: msg });
    }
};
