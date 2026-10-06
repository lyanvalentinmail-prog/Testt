'use strict';

const readline = require('readline');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  generateWAMessageFromContent,
  proto,
} = require('@whiskeysockets/baileys');
const config = require('./config');

const logger = pino({ level: process.env.LOG_LEVEL || 'silent' });
let reconnecting = false;

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => {
    rl.close();
    resolve(answer.trim());
  }));
}

function normalizePhone(value) {
  return value.replace(/[^0-9]/g, '');
}

function unwrapMessage(message) {
  if (!message) return {};
  if (message.ephemeralMessage) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage) return unwrapMessage(message.documentWithCaptionMessage.message);
  return message;
}

function getCommand(message) {
  const msg = unwrapMessage(message);
  const text =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    msg.buttonsResponseMessage?.selectedButtonId ||
    msg.listResponseMessage?.singleSelectReply?.selectedRowId ||
    msg.templateButtonReplyMessage?.selectedId;

  if (text) return text.trim().toLowerCase();

  const response = msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
  if (response) {
    try {
      const parsed = JSON.parse(response);
      return String(parsed.id || parsed.selectedId || '').trim().toLowerCase();
    } catch (_) {
      return '';
    }
  }
  return '';
}

async function sendMenu(sock, jid) {
  const rows = [
    { id: `${config.prefix}test1`, title: 'Test1', description: 'Ver la versión del bot' },
    { id: `${config.prefix}test2`, title: 'Test2', description: 'Ver el prefijo del bot' },
    { id: `${config.prefix}test3`, title: 'Test3', description: 'Ver el nombre del bot' },
  ];

  const content = proto.Message.InteractiveMessage.create({
    body: proto.Message.InteractiveMessage.Body.create({
      text: `¡Hola! Soy *${config.botName}*.\nPulsa el botón para abrir el menú.`,
    }),
    footer: proto.Message.InteractiveMessage.Footer.create({
      text: `Versión ${config.version}`,
    }),
    header: proto.Message.InteractiveMessage.Header.create({
      title: `🤖 ${config.botName}`,
      hasMediaAttachment: false,
    }),
    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
      buttons: [{
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
          title: 'Abrir lista',
          sections: [{ title: 'Opciones', highlight_label: 'Menú', rows }],
        }),
      }],
    }),
  });

  const message = generateWAMessageFromContent(jid, {
    viewOnceMessage: { message: { interactiveMessage: content } },
  }, { userJid: sock.user?.id });

  await sock.relayMessage(jid, message.message, { messageId: message.key.id });
}

async function handleMessage(sock, event) {
  if (event.type !== 'notify') return;

  for (const item of event.messages) {
    const jid = item.key.remoteJid;
    if (!jid || jid === 'status@broadcast' || !item.message) continue;

    const command = getCommand(item.message);
    if (!command) continue;

    try {
      if (command === `${config.prefix}menu`) {
        await sendMenu(sock, jid);
      } else if (command === `${config.prefix}test1`) {
        await sock.sendMessage(jid, { text: `📦 Versión del bot: *${config.version}*` }, { quoted: item });
      } else if (command === `${config.prefix}test2`) {
        await sock.sendMessage(jid, { text: `⌨️ Prefijo: *${config.prefix}*` }, { quoted: item });
      } else if (command === `${config.prefix}test3`) {
        await sock.sendMessage(jid, { text: `🤖 Nombre del bot: *${config.botName}*` }, { quoted: item });
      }
    } catch (error) {
      console.error('No se pudo responder al mensaje:', error.message);
    }
  }
}

async function startBot(mode) {
  const { state, saveCreds } = await useMultiFileAuthState('session');
  const { version } = await fetchLatestBaileysVersion();
  let pairingRequested = false;

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    browser: ['Termux Bot', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
  });

  if (mode === 'pairing' && !state.creds.registered) {
    pairingRequested = true;
    const rawPhone = process.env.PHONE_NUMBER || await ask('Número con código de país (ejemplo 521234567890): ');
    const phone = normalizePhone(rawPhone);
    if (phone.length < 8) throw new Error('El número ingresado no es válido.');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const code = await sock.requestPairingCode(phone);
    console.log(`\nCódigo de vinculación: ${code.match(/.{1,4}/g)?.join('-') || code}\n`);
  }

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', (event) => handleMessage(sock, event));
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr && mode === 'qr') {
      console.log('\nEscanea este QR en WhatsApp > Dispositivos vinculados:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      reconnecting = false;
      console.log(`✅ ${config.botName} conectado. Escribe ${config.prefix}menu en WhatsApp.`);
    }

    if (connection === 'close') {
      const status = lastDisconnect?.error?.output?.statusCode;
      const loggedOut = status === DisconnectReason.loggedOut;
      console.log(loggedOut ? 'Sesión cerrada. Borra session/ y vuelve a vincular.' : 'Conexión cerrada; reconectando...');
      if (!loggedOut && !reconnecting) {
        reconnecting = true;
        setTimeout(() => startBot(mode).catch(console.error), 3000);
      }
    }
  });

  if (pairingRequested) console.log('Escribe el código en WhatsApp > Dispositivos vinculados > Vincular con número.');
}

(async () => {
  try {
    let mode = (process.env.LOGIN_METHOD || process.argv[2] || '').toLowerCase();
    if (!['qr', 'pairing'].includes(mode)) {
      const answer = await ask('Método de conexión: [1] QR  [2] Pairing code: ');
      mode = answer === '2' ? 'pairing' : 'qr';
    }
    await startBot(mode);
  } catch (error) {
    console.error('Error al iniciar:', error.message);
    process.exitCode = 1;
  }
})();
