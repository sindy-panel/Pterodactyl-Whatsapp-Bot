require('./cpsettings')
const { default: panConnect, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, generateForwardMessageContent, prepareWAMessageMedia, generateWAMessageFromContent, generateMessageID, downloadContentFromMessage, makeInMemoryStore, jidDecode, proto } = require('@adiwajshing/baileys')
const pino = require('pino')
const { Boom } = require('@hapi/boom')
const fs = require('fs')
const chalk = require('chalk')
const figlet = require('figlet')
const FileType = require('file-type')
const path = require('path')
const PhoneNumber = require('awesome-phonenumber')

// ==> [ Lib ] 
const { color, bgcolor, mycolor } = require('../js/lib/color')
const { imageToWebp, videoToWebp, writeExifImg, writeExifVid } = require('../js/lib/exif')
const { smsg, isUrl, generateMessageTag, getBuffer, getSizeMedia, fetchJson, await, sleep } = require('../js/lib/functions')
const store = makeInMemoryStore({ logger: pino().child({ level: 'silent', stream: 'store' }) })

const startpan = async() => {

	global.db = JSON.parse(fs.readFileSync('./js/database/database.json'))
	global.db.data = {
	users: {},
	chats: {},
	sticker: {},
	database: {},
	game: {},
	settings: {},
	others: {},
	...(global.db.data || {})
	}
	
	function title() {
	  console.clear()
	  console.log(chalk.bold.green(figlet.textSync('CpanCloud', {
		font:'Standard',
		horizontalLayout: 'default',
		width: 80,
		whitespaceBreak: false
	  })))
	
		console.log(chalk.yellow(`\n${chalk.magentaBright('CpanCloudBot')} : ${chalk.greenBright('Bot WhatsApp Multi Device with Pterodactyl Remote')}\n${chalk.magentaBright('Chat Me')} : ${chalk.cyanBright('+62 812-3482-4414 (WhatsApp)')}\n`))
	}
	
	const { state, saveCreds } = await useMultiFileAuthState(`./session`)
	const { version, isLatest } = await fetchLatestBaileysVersion()
	
	function nocache(module, cb = () => { }) {
	  fs.watchFile(require.resolve(module), async () => {
		 await uncache(require.resolve(module))
		  cb(module)
	  })
	}
	
	function uncache(module = '.') {
	  return new Promise((resolve, reject) => {
		 try {
		   delete require.cache[require.resolve(module)]
		   resolve()
		 } catch (e) {
		   reject(e)
		 }
	  })
	}
	
	const pan = panConnect({
	version: [2, 2323, 4],
	logger: pino({ level: 'silent' }),
	printQRInTerminal: true,
	/* patchMessageBeforeSending: (message) => {
	   const requiresPatch = !!(
		  message.buttonMessage ||
		  message.templateMessage ||
		  message.listMessage
	   );
	   if (requiresPatch) {
		  message = {
			 viewOnceMessage: {
				message: {
				   messageContextInfo: {
					  deviceListMetadataVersion: 2,
					  deviceListMetadata: []
				   },
			   ...message,
			   },
			 },
		  };
	   }
	   return message;
	}, */
	browser: ['Pterodactyl Panel Control','Opera','1.0.0'],
	auth: state
	})
	title()

store.bind(pan.ev)

pan.ev.on('messages.upsert', async chatUpdate => {
	try {
	m = chatUpdate.messages[0]
	if (!m.message) return
	m.message = (Object.keys(m.message)[0] === 'ephemeralMessage') ? m.message.ephemeralMessage.message : m.message
	if (m.key && m.key.remoteJid === 'status@broadcast') return
	if (!pan.public && !m.key.fromMe && chatUpdate.type === 'notify') return
	if (m.key.id.startsWith('BAE5') && m.key.id.length === 16) return
	m = smsg(pan, m, store)
	require('../js/bot')(pan, m, chatUpdate, store)
	} catch (err) {
	console.log(err)
	}
	})
	
	pan.decodeJid = (jid) => {
	if (!jid) return jid
	if (/:\d+@/gi.test(jid)) {
	let decode = jidDecode(jid) || {}
	return decode.user && decode.server && decode.user + '@' + decode.server || jid
	} else return jid
	}
	
	pan.ev.on('contacts.update', update => {
	for (let contact of update) {
	let id = pan.decodeJid(contact.id)
	if (store && store.contacts) store.contacts[id] = { id, name: contact.notify }
	}
	})
	
	pan.getName = (jid, withoutContact= false) => {
	id = pan.decodeJid(jid)
	withoutContact = pan.withoutContact || withoutContact 
	let v
	if (id.endsWith("@g.us")) return new Promise(async (resolve) => {
	v = store.contacts[id] || {}
	if (!(v.name || v.subject)) v = pan.groupMetadata(id) || {}
	resolve(v.name || v.subject || PhoneNumber('+' + id.replace('@s.whatsapp.net', '')).getNumber('international'))
	})
	else v = id === '0@s.whatsapp.net' ? {
	id,
	name: 'WhatsApp'
	} : id === pan.decodeJid(pan.user.id) ?
	pan.user :
	(store.contacts[id] || {})
	return (withoutContact ? '' : v.name) || v.subject || v.verifiedName || PhoneNumber('+' + jid.replace('@s.whatsapp.net', '')).getNumber('international')
	}
	
	pan.sendContact = async (jid, kon, quoted = '', opts = {}) => {
		let list = []
		for (let i of kon) {
		list.push({
			displayName: await pan.getName(i + '@s.whatsapp.net'),
			vcard: `BEGIN:VCARD\nVERSION:3.0\nN:${await pan.getName(i + '@s.whatsapp.net')}\nFN:${await pan.getName(i + '@s.whatsapp.net')}\nitem1.TEL;waid=${i}:${i}\nitem1.X-ABLabel:Ponsel\nitem2.EMAIL;type=INTERNET:${email}\nitem2.X-ABLabel:Email\nitem3.URL:${youtube}\nitem3.X-ABLabel:YouTube\nitem4.ADR:;;${region};;;;\nitem4.X-ABLabel:Region\nEND:VCARD`
		})
		}
		pan.sendMessage(jid, { contacts: { displayName: `${list.length} Kontak`, contacts: list }, ...opts }, { quoted })
	}
	
	pan.setStatus = (status) => {
	pan.query({
	tag: 'iq',
	attrs: {
	to: '@s.whatsapp.net',
	type: 'set',
	xmlns: 'status',
	},
	content: [{
	tag: 'status',
	attrs: {},
	content: Buffer.from(status, 'utf-8')
	}]
	})
	return status
	}
	
	pan.public = true
	
	pan.serializeM = (m) => smsg(pan, m, store)
	
	pan.ev.on('connection.update', (update) => {
	const {connection,lastDisconnect} = update
	if (connection === 'close') {lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut ? startpan() : ''}
	else if(connection === 'open') {pan.sendMessage("6281234824414@s.whatsapp.net", {text:`${JSON.stringify(update, undefined, 2)}`})}
	console.log(update)})
	
	pan.send5ButGif = async (jid , text = '' , footer = '', but = [], options = {}) =>{
	let message = await prepareWAMessageMedia({ video: thumb, gifPlayback: true }, { upload: pan.waUploadToServer })
	 const template = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
	 templateMessage: {
	 hydratedTemplate: {
	 videoMessage: message.videoMessage,
	 "hydratedContentText": text,
	 "hydratedFooterText": footer,
	 "hydratedButtons": but
	}
	}
	}), options)
	pan.relayMessage(jid, template.message, { messageId: template.key.id })
	}
	
	pan.send5ButImg = async (jid , text = '' , footer = '', img, but = [], options = {}) =>{
	let message = await prepareWAMessageMedia({ image: img }, { upload: pan.waUploadToServer })
	var template = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
	templateMessage: {
	hydratedTemplate: {
	imageMessage: message.imageMessage,
	 "hydratedContentText": text,
	 "hydratedFooterText": footer,
	 "hydratedButtons": but
	}
	}
	}), options)
	pan.relayMessage(jid, template.message, { messageId: template.key.id })
	}
	
	pan.send5ButVid = async (jid , text = '' , footer = '', vid, but = [], options = {}) =>{
	let message = await prepareWAMessageMedia({ video: vid }, { upload: pan.waUploadToServer })
	var template = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
	templateMessage: {
	hydratedTemplate: {
	videoMessage: message.videoMessage,
	 "hydratedContentText": text,
	 "hydratedFooterText": footer,
	 "hydratedButtons": but
	}
	}
	}), options)
	pan.relayMessage(jid, template.message, { messageId: template.key.id })
	}
	
	pan.send5ButLoc = async (jid , text = '' , footer = '', img, but = [], options = {}) =>{
	var template = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
	templateMessage: {
	hydratedTemplate: {
	 "hydratedContentText": text,
	 "locationMessage": {
	 "jpegThumbnail": img },
	 "hydratedFooterText": footer,
	 "hydratedButtons": but
	}
	}
	}), options)
	pan.relayMessage(jid, template.message, { messageId: template.key.id })
	}
	
	pan.sendList = async (jid , title = '', text = '', buttext = '', footer = '', but = [], options = {}) =>{
	var template = generateWAMessageFromContent(m.chat, proto.Message.fromObject({
	listMessage :{
	 title: title,
	 description: text,
	 buttonText: buttext,
	 footerText: footer,
	 listType: "SELECT",
	 sections: but,
	 listType: 1
	}
	}), options)
	pan.relayMessage(jid, template.message, { messageId: template.key.id })
	}
	
	pan.sendButtonText = (jid, buttons = [], text, footer, quoted = '', options = {}) => {
	let buttonMessage = {
	text,
	footer,
	buttons,
	headerType: 2,
	...options
	}
	pan.sendMessage(jid, buttonMessage, { quoted, ...options })
	}
	
	pan.sendButMessage = async (id, text1, desc1, but = [], options) => {
	let buttonMessage = {
	text: text1,
	footer: desc1,
	buttons: but,
	headerType: 1
	}
	return pan.sendMessage(id, buttonMessage,{quoted: options})
	}
	
	pan.parseMention = (text = '') => {
	return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net')
	}
	
	pan.sendText = (jid, text, quoted = '', options) => pan.sendMessage(jid, { text: text, ...options }, { quoted })
	
	pan.sendImage = async (jid, path, caption = '', quoted = '', options) => {
		let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
	return await pan.sendMessage(jid, { image: buffer, caption: caption, ...options }, { quoted })
	}
	
	pan.sendVideo = async (jid, path, caption = '', quoted = '', gif = false, options) => {
	let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
	return await pan.sendMessage(jid, { video: buffer, caption: caption, gifPlayback: gif, ...options }, { quoted })
	}
	
	pan.sendAudio = async (jid, path, quoted = '', ptt = false, options) => {
	let buffer = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
	return await pan.sendMessage(jid, { audio: buffer, ptt: ptt, ...options }, { quoted })
	}
	
	pan.sendTextWithMentions = async (jid, text, quoted, options = {}) => pan.sendMessage(jid, { text: text, contextInfo: { mentionedJid: [...text.matchAll(/@(\d{0,16})/g)].map(v => v[1] + '@s.whatsapp.net') }, ...options }, { quoted })
	
	pan.sendImageAsSticker = async (jid, path, quoted, options = {}) => {
	let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
	let buffer
	if (options && (options.packname || options.author)) {
	buffer = await writeExifImg(buff, options)
	} else {
	buffer = await imageToWebp(buff)
	}
	
	await pan.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
	return buffer
	}
	
	pan.sendVideoAsSticker = async (jid, path, quoted, options = {}) => {
	let buff = Buffer.isBuffer(path) ? path : /^data:.*?\/.*?;base64,/i.test(path) ? Buffer.from(path.split`,`[1], 'base64') : /^https?:\/\//.test(path) ? await (await getBuffer(path)) : fs.existsSync(path) ? fs.readFileSync(path) : Buffer.alloc(0)
	let buffer
	if (options && (options.packname || options.author)) {
	buffer = await writeExifVid(buff, options)
	} else {
	buffer = await videoToWebp(buff)
	}
	
	await pan.sendMessage(jid, { sticker: { url: buffer }, ...options }, { quoted })
	return buffer
	}
	 
	pan.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => {
	let quoted = message.msg ? message.msg : message
	let mime = (message.msg || message).mimetype || ''
	let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
	const stream = await downloadContentFromMessage(quoted, messageType)
	let buffer = Buffer.from([])
	for await(const chunk of stream) {
	buffer = Buffer.concat([buffer, chunk])
	}
		let type = await FileType.fromBuffer(buffer)
	trueFileName = attachExtension ? (filename + '.' + type.ext) : filename
	await fs.writeFileSync(trueFileName, buffer)
	return trueFileName
	}
	
	pan.downloadMediaMessage = async (message) => {
	let mime = (message.msg || message).mimetype || ''
	let messageType = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]
	const stream = await downloadContentFromMessage(message, messageType)
	let buffer = Buffer.from([])
	for await(const chunk of stream) {
	buffer = Buffer.concat([buffer, chunk])
		}
		return buffer
	 }
	 
	pan.copyNForward = async (jid, message, forceForward = false, options = {}) => {
	let vtype
			if (options.readViewOnce) {
				message.message = message.message && message.message.ephemeralMessage && message.message.ephemeralMessage.message ? message.message.ephemeralMessage.message : (message.message || undefined)
				vtype = Object.keys(message.message.viewOnceMessage.message)[0]
				delete(message.message && message.message.ignore ? message.message.ignore : (message.message || undefined))
				delete message.message.viewOnceMessage.message[vtype].viewOnce
				message.message = {
					...message.message.viewOnceMessage.message
				}
			}
	let mtype = Object.keys(message.message)[0]
	let content = await generateForwardMessageContent(message, forceForward)
	let ctype = Object.keys(content)[0]
			let context = {}
	if (mtype != "conversation") context = message.message[mtype].contextInfo
	content[ctype].contextInfo = {
	...context,
	...content[ctype].contextInfo
	}
	const waMessage = await generateWAMessageFromContent(jid, content, options ? {
	...content[ctype],
	...options,
	...(options.contextInfo ? {
	contextInfo: {
	...content[ctype].contextInfo,
	...options.contextInfo
	}
	} : {})
	} : {})
	await pan.relayMessage(jid, waMessage.message, { messageId:waMessage.key.id })
	return waMessage
	}
	
	pan.cMod = (jid, copy, text = '', sender = pan.user.id, options = {}) => {
			let mtype = Object.keys(copy.message)[0]
			let isEphemeral = mtype === 'ephemeralMessage'
	if (isEphemeral) {
	mtype = Object.keys(copy.message.ephemeralMessage.message)[0]
	}
	let msg = isEphemeral ? copy.message.ephemeralMessage.message : copy.message
			let content = msg[mtype]
	if (typeof content === 'string') msg[mtype] = text || content
			else if (content.caption) content.caption = text || content.caption
			else if (content.text) content.text = text || content.text
			if (typeof content !== 'string') msg[mtype] = {
				...content,
				...options
	}
	if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
			else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant
			if (copy.key.remoteJid.includes('@s.whatsapp.net')) sender = sender || copy.key.remoteJid
			else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid
			copy.key.remoteJid = jid
			copy.key.fromMe = sender === pan.user.id
	return proto.WebMessageInfo.fromObject(copy)
	}
	
	pan.getFile = async (PATH, save) => {
	let res
	let data = Buffer.isBuffer(PATH) ? PATH : /^data:.*?\/.*?;base64,/i.test(PATH) ? Buffer.from(PATH.split`,`[1], 'base64') : /^https?:\/\//.test(PATH) ? await (res = await getBuffer(PATH)) : fs.existsSync(PATH) ? (filename = PATH, fs.readFileSync(PATH)) : typeof PATH === 'string' ? PATH : Buffer.alloc(0)
	let type = await FileType.fromBuffer(data) || {
	mime: 'application/octet-stream',
	ext: '.bin'
	}
	filename = path.join(__filename, '../src/' + new Date * 1 + '.' + type.ext)
	if (data && save) fs.promises.writeFile(filename, data)
	return {
	res,
	filename,
		size: await getSizeMedia(data),
	...type,
	data
	}
	}
	return pan
	}
	
	startpan()
	
	let file = require.resolve(__filename)
	fs.watchFile(file, () => {
	fs.unwatchFile(file)
	console.log(chalk.yellowBright(`Update File Terbaru ${__filename}`))
	delete require.cache[file]
	require(file)
	})
