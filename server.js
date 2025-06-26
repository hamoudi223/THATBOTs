import {
  makeWASocket,
  useSingleFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeInMemoryStore,
} from "@adiwajshing/baileys";
import P from "pino";
import fs from "fs";
import { Boom } from "@hapi/boom";
import { getMenuBuffer } from "./utils/menuImage.js";
import { detectLink } from "./utils/antiLink.js";
import { existsSync, mkdirSync } from "fs";

// Préfixe des commandes
const prefix = "!";

// Créer dossier session si non existant
if (!existsSync("./session")) {
  mkdirSync("./session");
}

const { state, saveState } = useSingleFileAuthState("./session/auth_info.json");
const store = makeInMemoryStore({ logger: P().child({ level: "silent", stream: "store" }) });

const startSock = async () => {
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    printQRInTerminal: true,
    auth: state,
    syncFullHistory: false,
  });

  store.bind(sock.ev);
  sock.ev.on("creds.update", saveState);

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith("@g.us");
    const sender = isGroup ? msg.key.participant : from;
    const body =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      "";

    console.log(`📩 ${sender} -> ${body}`);

    if (!body.startsWith(prefix)) return;
    const args = body.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === "menu") {
      const menuImage = await getMenuBuffer();
      await sock.sendMessage(from, {
        image: menuImage,
        caption: `🤖 *MENU BOT*\n\n📌 !menu\n📌 !take <pseudo>\n📌 !anti-link <warn|delete|kick>`,
      });
    }

    if (command === "take") {
      if (!msg.message?.stickerMessage) {
        await sock.sendMessage(from, { text: "❌ Envoie un sticker avec la commande." });
        return;
      }

      const pseudo = args.join(" ") || "Anonyme";
      const sticker = msg.message.stickerMessage;
      await sock.sendMessage(from, {
        sticker: sticker,
        contextInfo: { externalAdReply: { title: `Volé par ${pseudo}` } },
      });
    }

    if (command === "anti-link") {
      const mode = args[0];
      if (!["warn", "delete", "kick"].includes(mode)) {
        await sock.sendMessage(from, {
          text: "❌ Mode invalide. Utilise : !anti-link <warn|delete|kick>",
        });
        return;
      }

      sock.ev.on("messages.update", async ({ messages }) => {
        for (let msg of messages) {
          const newMsg = msg.update.message?.extendedTextMessage?.text || "";
          if (detectLink(newMsg)) {
            console.log(`🔗 Lien détecté dans message modifié: ${newMsg}`);

            if (mode === "warn") {
              await sock.sendMessage(from, {
                text: `⚠️ Pas de liens ici !`,
              });
              await sock.sendMessage(from, { delete: msg.key });
            }

            if (mode === "delete") {
              await sock.sendMessage(from, { delete: msg.key });
            }

            if (mode === "kick") {
              await sock.groupParticipantsUpdate(from, [msg.key.participant], "remove");
            }
          }
        }
      });

      sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          "";

        if (detectLink(text)) {
          console.log(`🔗 Lien détecté: ${text}`);

          if (mode === "warn") {
            await sock.sendMessage(from, { text: "⚠️ Pas de liens ici !" });
            await sock.sendMessage(from, { delete: msg.key });
          }

          if (mode === "delete") {
            await sock.sendMessage(from, { delete: msg.key });
          }

          if (mode === "kick") {
            await sock.groupParticipantsUpdate(from, [msg.key.participant], "remove");
          }
        }
      });

      await sock.sendMessage(from, { text: `✅ Anti-link activé (${mode})` });
    }
  });

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect?.error?.output?.statusCode || 0) !== DisconnectReason.loggedOut;
      console.log("🔌 Déconnecté. Reconnexion :", shouldReconnect);
      if (shouldReconnect) {
        startSock();
      }
    } else if (connection === "open") {
      console.log("✅ Bot connecté !");
    }
  });
};

startSock();
