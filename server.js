import makeWASocket, {
  useSingleFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@adiwajshing/baileys'
import { Boom } from '@hapi/boom'
import P from 'pino'

import { menu } from './utils/menu.js'
import { pointTake } from './utils/pointTake.js'
import { antiLink, warnings } from './utils/antiLink.js'

const PREFIX = '.'

async function startBot() {
  const { state, saveState } = useSingleFileAuthState('./auth_info.json')
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    printQRInTerminal: true,
    auth: state,
    version,
  })

  sock.ev.on('creds.update', saveState)

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update
    if (connection === 'close') {
      if (
        (lastDisconnect.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut
      ) {
        startBot()
      } else {
        console.log('Connection closed. You are logged out.')
      }
    }
    if (connection === 'open') {
      console.log('Connected to WhatsApp!')
    }
  })

  sock.ev.on('messages.upsert', async (m) => {
    if (!m.messages || m.type !== 'notify') return
    const msg = m.messages[0]

    if (!msg.message || msg.key.fromMe) return

    const from = msg.key.remoteJid
    const isGroup = from.endsWith('@g.us')

    // Extract message text
    let text = ''
    if (msg.message.conversation) {
      text = msg.message.conversation
    } else if (msg.message.extendedTextMessage) {
      text = msg.message.extendedTextMessage.text
    } else {
      return
    }

    if (!text.startsWith(PREFIX)) return

    const args = text.slice(PREFIX.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()

    try {
      switch (command) {
        case 'menu':
          await menu(sock, from)
          break

        case 'point':
          if (args[0] === 'take') {
            await pointTake(sock, from, msg, args)
          } else {
            await sock.sendMessage(from, {
              text: 'Commande invalide. Usage: .point take <pseudo>',
            })
          }
          break

        case 'anti-link':
          await antiLink(sock, from, msg, args)
          break

        default:
          await sock.sendMessage(from, { text: 'Commande inconnue.' })
          break
      }
    } catch (err) {
      console.error('Erreur commande:', err)
    }
  })

  // Détection et traitement des liens en fonction du mode anti-link activé
  sock.ev.on('messages.upsert', async (m) => {
    if (!m.messages || m.type !== 'notify') return
    const msg = m.messages[0]
    if (!msg.message) return

    const from = msg.key.remoteJid
    if (!from.endsWith('@g.us')) return // Que dans les groupes

    const groupSettings = warnings[from]
    if (!groupSettings) return

    let text = ''
    if (msg.message.conversation) {
      text = msg.message.conversation
    } else if (msg.message.extendedTextMessage) {
      text = msg.message.extendedTextMessage.text
    } else {
      return
    }

    const urlRegex = /(https?:\/\/[^\s]+)/g
    if (urlRegex.test(text)) {
      const sender = msg.key.participant || msg.key.remoteJid
      const mode = groupSettings.mode

      if (mode === 'warn') {
        if (!groupSettings.warnedUsers[sender]) {
          groupSettings.warnedUsers[sender] = 1
          await sock.sendMessage(from, {
            text: `@${sender.split('@')[0]}, les liens sont interdits ici ! (avertissement 1)`,
          }, { mentions: [sender] })
        } else {
          groupSettings.warnedUsers[sender]++
          await sock.sendMessage(from, {
            text: `@${sender.split('@')[0]}, attention, dernier avertissement !`,
          }, { mentions: [sender] })
        }
      } else if (mode === 'delete') {
        // Supprime le message contenant le lien
        await sock.sendMessage(from, {
          delete: { remoteJid: from, fromMe: false, id: msg.key.id, participant: msg.key.participant },
        })
        await sock.sendMessage(from, { text: 'Lien supprimé.' })
      } else if (mode === 'kick') {
        // Supprime le message et expulse l'utilisateur
        try {
          await sock.groupRemove(from, [msg.key.participant])
          await sock.sendMessage(from, { text: `@${sender.split('@')[0]} a été expulsé pour envoi de lien.` }, { mentions: [msg.key.participant] })
        } catch (e) {
          console.error('Erreur lors de l’expulsion:', e)
          await sock.sendMessage(from, { text: 'Impossible d’expulser cet utilisateur.' })
        }
      }
    }
  })
}

startBot()
