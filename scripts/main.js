const CLIENT_ID = '368mzno8zop311dlixwz4v7qvp0dgz'; /* keep this in sync with hardcoded oauth2/authorize links */
const repeatStreamStatusLiveAfterMS = 1000 * 60 * 2; //2min
const repeatStreamStatusOfflineAfterMS = 1000 * 30; //30s
const largestMessageTimeout = 1000 * 40; //40s is good for 500 chars with one emoji and only some numbers
const ignoreSkipMessageAfterMS = 1000 * 30; //seconds after skipped message gets ignored
const andTranslations = {'en-US':' and ', 'de-DE': ' und ', 'fr-FR': ' et '}; //for Microsoft Multilingual voices bug
const audioCtx = new AudioContext();

let accessToken;
let client;
let voices;
let wakeLock;
let lastStatusSpeekTime = 0;
let lastSpeekTime = 0; 
let lastUserCount = 0;
let lastStreamStatus = undefined;
let voiceOrder;
const voiceDetails = new Map();
let cheermoteRegex = generateCheermoteRegex();
let skippedMessages = [];
let clickSound;

//todo repeat last text with mediaSession button

function loadSettings() {
	document.querySelector('#channel').value = localStorage.getItem('channel');
	document.querySelector('#startBtn').onclick = start;
	document.querySelector('#stopBtn').onclick = stop;

	if (document.location.hash) {
		var parsedHash = new URLSearchParams(window.location.hash.substr(1));
		history.replaceState({}, '',  window.location.pathname); //hide the accessToken from accidental screen shares
		validateAccessToken(parsedHash.get('access_token'));
	} else {
		validateAccessToken(localStorage.getItem('accessToken'));
	}

	document.querySelectorAll('select[name=voice]').forEach((select) => select.addEventListener('change', onVoiceSelectChange));

	if(localStorage.getItem('lastGetVoiceListBugAgent') == navigator.userAgent) {
		const androidEdgeHack = document.querySelector('#androidEdgeHack');
		androidEdgeHack.removeAttribute('hidden');
		document.getSelection().selectAllChildren(androidEdgeHack);
		const androidEdgeHackBtn = androidEdgeHack.querySelector('button').onclick = () => {
			androidEdgeHack.setAttribute('hidden', true);
			loadVoices();
		};
	} else {
		loadVoices();
	}
	if (window.speechSynthesis.onvoiceschanged !== undefined) {
		window.speechSynthesis.onvoiceschanged = loadVoices;
	}
	window.addEventListener('focus', pageLifecycleChange);
	window.addEventListener('pageshow', pageLifecycleChange);
	window.addEventListener('visibilitychange', pageLifecycleChange);
	window.addEventListener('beforeunload', preventPageLeave);

	const statusVoiceForm = document.querySelector('#statusVoice');
	statusVoiceForm.onsubmit = testStatusVoice;
	statusVoiceForm.getElementsByTagName('button')[0].removeAttribute('disabled');
	document.querySelectorAll('form[name="chatVoice"]').forEach((chatVoiceForm) => {
		chatVoice.onsubmit = testChatVoice;
		chatVoice.getElementsByTagName('button')[0].removeAttribute('disabled');
	});

	//TODO make it configurable
	navigator.mediaSession.setActionHandler("play", handleNextMsg);
	navigator.mediaSession.setActionHandler("pause", handleNextMsg);
	navigator.mediaSession.setActionHandler("nexttrack", handlePrevMsg);
}

function onVoiceSelectChange(e) {
	//online Microsoft Voices don't have support for pitch
	const hasNoPitchSupport = e.target.value.includes('Microsoft') && e.target.value.includes('Online');
	e.target.form.querySelector('input[name=pitch]').parentElement.hidden = hasNoPitchSupport;
}

function pageLifecycleChange() {
	 if(client?.ws) requestWakeLock()
}

function preventPageLeave(e) {
	if(client?.ws && !document.querySelector('#stopBtn').disabled) e.preventDefault();
}

function loadVoices() {
	const oldVoiceCount = voices?.length;
	voices = window.speechSynthesis.getVoices();
	const newVoiceCount = voices?.length;
	if(newVoiceCount === 0 && navigator.userAgent.includes('EdgA')) {
		localStorage.setItem('lastGetVoiceListBugAgent', navigator.userAgent);
		window.location.reload(); //only a reload does unstuck the getVoices call
	}
	if (newVoiceCount > 0) {
		document.querySelector('#androidEdgeHack').setAttribute('hidden', true); //hide the note if everthing is working
	}
	if(!newVoiceCount > 0 || oldVoiceCount == newVoiceCount) {
		return;
	}

	if(voiceOrder) {
		populateVoicesSelects();
	} else {
		getVoiceOrder().then(populateVoicesSelects);
	}
}

function populateVoicesSelects() {
	let voiceSelects = document.querySelectorAll('select[name="voice"]');
	voiceSelects.forEach((selectElement) => selectElement.innerHTML = '');
	voices = voices.reduce((sorted, voice, index) => {
		sorted[voiceOrder.indexOf(voice.name) + 1 || voiceOrder.length + index] = voice;
		return sorted
	}, []).filter(x => x);
	voices.forEach((voice) => {
		const option = document.createElement('option');
		option.value = voice.name;
		option.textContent = `${voice.name} (${voice.lang})`;
		option.setAttribute('data-lang', voice.lang);
		option.setAttribute('data-name', voice.name);
		voiceSelects.forEach((selectElement) => selectElement.appendChild(option.cloneNode(true)));
	});

	document.querySelector('#statusVoice [name=voice]').value=voices?.find(v => v.lang.includes('en'))?.name;
	document.querySelector('form[name=chatVoice] [name=voice]').value=voices?.find(v => v.lang.includes(navigator.language))?.name; 
	//[...document.querySelector('#statusVoice [name=voice]').options].map(o => o.value).includes(voiceFromSettings) 
	document.querySelectorAll('select[name=voice]').forEach((e) => e.dispatchEvent(new Event('change')));
}

async function getVoiceOrder() {
	const responses = await Promise.all([
		fetch('https://hadriengardeur.github.io/web-speech-recommended-voices/json/' + navigator.language.substr(0,2) + '.json'),
		fetch('https://hadriengardeur.github.io/web-speech-recommended-voices/json/en.json')
	]);
	voiceOrder = (await Promise.all(responses.map(parseVoiceOrder))).flat();
};

async function parseVoiceOrder(response) {
	let voiceNames = [];
	try {
		const json = await response.json();
		voiceDetails.set(json.language, json);
		voiceNames = json.voices.reduce((vNames, voice) => {
			vNames.push(voice.name); 
			if(voice.altNames) vNames.push(...voice.altNames); 
			return vNames
		}, []);
	} catch (error) {
		console.warn(error);
	}
	return voiceNames;
}

function checkStreamStatus(onEnd) {
	const channel = document.querySelector('#channel').value;
	return getHelixJSON('streams?user_login=' + channel).then(result => {
		const newTime = new Date();
		let statusMessage = '';
		if(result?.data) {
			const newStreamStatus = result.data[0]?.type;
			const newUserCount = result.data[0]?.viewer_count;
			const repeatStreamStatusAfterMS = newStreamStatus=='live' ? repeatStreamStatusLiveAfterMS : repeatStreamStatusOfflineAfterMS;
			if(lastStreamStatus != newStreamStatus) {
				if(newStreamStatus=='live') {
					statusMessage = 'Stream got live. ' + newUserCount + ' Viewers';
				} else {
					statusMessage = 'Stream got offline';
				}
			}
			if(newTime - lastStatusSpeekTime > repeatStreamStatusAfterMS) {
				if(newStreamStatus=='live') {
					if(newTime - lastSpeekTime > repeatStreamStatusAfterMS) {
						statusMessage = newUserCount + ' Viewers'; //if silent, repeat viewer count as "still alive" ping
					}
				} else {
					statusMessage = 'Stream is still offline'; //repeat still offline even if chat is talking
				}
			}
			lastStreamStatus = newStreamStatus;
			lastUserCount = newUserCount;
		} else {
			statusMessage = 'Could not get stream status';
			self.reportError(new Error(`Query for ${channel} result: ` + JSON.stringify(result)));
		}
		if(statusMessage) {
			lastStatusSpeekTime = newTime;
			//return promise to wait until speech is done
			return new VoiceMessage(statusMessage)
				.speak(new FormData(document.querySelector('#statusVoice')), 7000); //need a tighter 7s limit for repeating speech
		}
	});
} 

async function getHelixJSON(path) {
	try {
		const response = await fetch('https://api.twitch.tv/helix/' + path,{
			headers: {
				'Client-Id': CLIENT_ID,
				Authorization: 'Bearer ' + accessToken
			},
			method: 'get'
		});
		let content;
		try {
			content = await response.json();
		} catch (error) {
			content = await response.text();
		}
		if(!response.ok) {
			if(response.status === 401) {
				displayErrorMsg('Your Twitch connection expired, you need to authorize again.')
			} else {
				self.reportError(new Error(([response.statusText || response.status, JSON.stringify(content)].join(': '))));
			}
		}
		return content; //return either success or error content
	} catch (error) {
		self.reportError(new Error(err));
	}
}

function validateAccessToken(token) {
	if(!token) {
		return;
	}
	accessToken = token;
	getHelixJSON('users').then(function(j) {
		console.log(j);
		const displayName = j?.data?.[0]?.display_name;
		if(displayName) {
			localStorage.setItem('accessToken', accessToken);
			document.querySelector('#authorizeLabel').innerHTML = '&#x27F3 Update Connection'
			document.querySelector('#channel').removeAttribute('disabled');
			document.querySelector('#startBtn').removeAttribute('disabled');
			localStorage.setItem('displayName', displayName);
			let channelInput = document.querySelector('#channel');
			if(!channelInput.value) {
				channelInput.value = j.data[0].login;
			}
		}
	})
}

function generateCheermoteRegex(customList) {
	const defaultList = ['Cheer','DoodleCheer','BibleThump','cheerwhal','Corgo','Scoops','uni','ShowLove','Party','SeemsGood','Pride',
		'Kappa','FrankerZ','HeyGuys','DansGame','EleGiggle','TriHard','Kreygasm','4Head','SwiftRage','NotLikeThis','FailFish','VoHiYo',
		'PJSalt','MrDestructoid','bday','RIPCheer','Shamrock','BitBoss','Streamlabs','Muxy','HolidayCheer','Goal','Anon','Charity' ];
	return new RegExp(`\\b(${(customList ?? defaultList).join('|')})(\\d+)\\b`, 'giu');
}

async function requestWakeLock() {
	try {
		if(wakeLock?.released != false && !document.hidden) {
			wakeLock = await navigator.wakeLock.request();
		}
	} catch (err) {
		self.reportError(err);
	}
};

function speakSkippedMessage() {
	if (window.speechSynthesis.speaking || !skippedMessages.length) {
		return;
	}
	const now = Date.now();
	if(now - skippedMessages[skippedMessages.length-1].date.getTime() < ignoreSkipMessageAfterMS) {
		const chatVoice = document.querySelectorAll('form[name="chatVoice"]')[0];
		skippedMessages.pop().speak(new FormData(chatVoice)).then(speakSkippedMessage);
	}
	const ignoredMsgContainer = document.querySelector('#ignoredMsgContainer');
	while(skippedMessages.length && now - skippedMessages[0].date.getTime() >= ignoreSkipMessageAfterMS) {
		const voiceMsg = skippedMessages.shift();
		const formattedMsg = `[${voiceMsg.date.toTimeString().split(' ')[0]}] ${voiceMsg.message}`;
		console.warn('ignored ' + formattedMsg);
		const newLine = document.createElement('div');
		newLine.textContent = formattedMsg;
		ignoredMsgContainer.appendChild(newLine)
	}
}

function start(e){
	e.currentTarget.disabled=true;
	e.preventDefault();
	document.querySelector('#stopBtn').removeAttribute('disabled');
	document.querySelectorAll('#connectionForm input').forEach(e => e.disabled = true);

	let channel = document.querySelector('#channel').value;
	localStorage.setItem('channel', channel);
	const statusVoiceData = new FormData(document.querySelector('#statusVoice'));
	//iOS needs to use speech at least once syncronusly, otherwise the async results can't use speech
	new VoiceMessage('Connect to ' + channel).speak(statusVoiceData);
	checkStreamStatus();
	setInterval(() => checkStreamStatus().then(speakSkippedMessage), 5000);

	client = new tmi.Client({
		options: {
			debug: true,
			skipUpdatingEmotesets: true
		},
		connection: {reconnect: true},
		identity: {
			username: localStorage.getItem('displayName'),
			password: 'oauth:' + localStorage.getItem('accessToken')
		},
		channels: [channel]
	});

	client.connect().catch(console.error);

	const chatVoice = document.querySelectorAll('form[name="chatVoice"]')[0];

	client.on('roomstate', (channel, tags) => {
		console.log('roomstate');
		console.log(channel);
		console.log(tags['room-id']);
		getHelixJSON('bits/cheermotes?broadcaster_id=' + tags['room-id']).then(result => {
			if(result?.data) {
				console.log(result.data);
				cheermoteRegex = generateCheermoteRegex(result.data.map(e => e.prefix));
			}
		});
	});
	client.on('message', (channel, user, message, self) => {
		if (self) return;
		if (user['message-type'] === 'chat' || user['message-type'] === 'action') {
			const voiceMessage = new VoiceMessage(message);
			voiceMessage.removeEmotesExceptFirst(user.emotes); //needs be be execute before altering the message
			voiceMessage.removeEmojisExceptFirst();
			if (window.speechSynthesis.speaking) {  //don't queue the new message, because threre could be long or more importand messages
				skippedMessages.push(voiceMessage); 
			} else {
				voiceMessage.speak(new FormData(chatVoice)).then(speakSkippedMessage);
			}
		}
	});
	client.on('cheer', (target, userstate, message) => {
		//TODO abort seek (if seek: cancel and seek btn block sound)
		const voiceMessage = new VoiceMessage(message);
		voiceMessage.removeEmotesExceptFirst(userstate.emotes); //needs be be execute before altering the message
		voiceMessage.removeEmojisExceptFirst();
		voiceMessage.removeAll(cheermoteRegex);
		message = `cheer ${userstate.bits} bits from ${userstate.username}: "${message}"`;
		new VoiceMessage(message).speak(new FormData(chatVoice)).then(speakSkippedMessage);
	});
	
	client.on('resub', (channel, username, months, message, userstate, methods) => {
		let cumulativeMonths = ~~userstate['msg-param-cumulative-months'];
		const voiceMessage = new VoiceMessage(message);
		voiceMessage.removeEmotesExceptFirst(userstate.emotes); //needs be be execute before altering the message
		voiceMessage.removeEmojisExceptFirst();
		message = `resub ${cumulativeMonths} month from ${username}: "${message}"`;
		//TODO will get los if it lands in queue and we needed to call cancel
		new VoiceMessage(message).speak(new FormData(chatVoice)).then(speakSkippedMessage);
	});
	requestWakeLock();
	//TODO getter for lazy init
	clickSound = createClickSound(statusVoiceData.get('volume')*0.5, 1000); //needs to be on a user event
}

function stop(e){
	e.currentTarget.disabled=true;
	client.disconnect();
	wakeLock?.release();
	window.location.reload();
}

function testStatusVoice(e){
	e.submitter.disabled = true;
	e.preventDefault();
	const formData = new FormData(e.currentTarget);
	new VoiceMessage('Stream Status').speak(formData);
	lastStatusSpeekTime = 0; //force repeat
	checkStreamStatus()
		.then(() => e.submitter.disabled = false)
		.then(speakSkippedMessage);
	return false;
}

function testChatVoice(e){
	e.submitter.disabled = true;
	e.preventDefault();
	const testMsg = new VoiceMessage(voiceDetails.get(navigator.language.substr(0,2))?.testUtterance || 'PS VR 2 Twitch Chat');
	testMsg.speak(new FormData(e.currentTarget))
		.then(() => e.submitter.disabled = false)
		.then(speakSkippedMessage);
	return false;
}

function withTimeout(time, prom) {
	let timer;
	return Promise.race([
		prom,
		new Promise((_r, rej) => timer = setTimeout(rej, time, `timeout after ${time}ms`))
	]).finally(() => clearTimeout(timer));
}

class VoiceMessage {
	constructor(message) {
		this.message = message;
		this.utterance = new SpeechSynthesisUtterance(message);
		this.date = new Date();
		this.compleated = false;
		this.utterance.addEventListener('end', (event) => {
			this.compleated = true;
			console.log('spoken: ' + event.utterance.text);
		});
		this.utterance.addEventListener('error', (event) => {
			if(event.error == 'interrupted') { //regular cancel call
				console.log('aborted: ' + this.utterance.text);
			} else {
				console.log(this);
				console.error(event);
				self.reportError(new Error('Speech error: ' + event.error));
			}
		});
		
	}
	
	removeEmotesExceptFirst(emotes) {
		if (!emotes) {
			return;
		}
		let newMessage = [...this.message]; //unicode aware split
		Object.values(emotes)
			.flat()
			.map((e) => e.split('-').map(Number))
			.sort((a,b) => a[0] > b[0])
			.slice(1) //remove any emote except index 0
			.reverse()
			.forEach((emoteIndices) => newMessage.splice(emoteIndices[0], emoteIndices[1] + 1 - emoteIndices[0]));
		this.utterance.text = newMessage.join('');
	}

	removeEmojisExceptFirst() {
		if (!this.utterance.text) {
			return;
		}
		let alreadyFound = false;
		this.utterance.text = this.utterance.text.replace(/\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic})*/gu, match => {
			if (alreadyFound) {
				return ''
			} else {
				alreadyFound = true;
				return match;
			}
		})
	}
	
	removeAll(regex) {
		if (this.utterance.text) {
			this.utterance.text = this.utterance.text.replaceAll(regex, '');
		}
	}

	speak(voiceFormData, timeout = largestMessageTimeout) {
		
		return withTimeout(timeout, new Promise(resolve => {
			if (!this.utterance.text) {
				resolve();
			}
			
			lastSpeekTime = new Date();
			console.log('queue: ' + this.utterance.text); //see unprocessed text with tmi debug console info
			
			this.utterance.addEventListener('end', resolve);
			this.utterance.addEventListener('error', resolve);
			if(voiceFormData) {
				if(!this.utterance.voice) {
					const voiceName = voiceFormData.get('voice');
					this.utterance.voice = voices?.find(voice => {return voice.name == voiceName});
					this.utterance.pitch = voiceFormData.get('pitch');
					this.utterance.rate = voiceFormData.get('rate');
					if(this.utterance?.voice?.name?.includes('Multilingual')) { //avoid Edge Multilingual crash at &
						this.utterance.text = this.utterance.text.replaceAll('&', andTranslations[this.utterance.voice?.lang] || ' ');
						this.utterance.text = this.utterance.text.replace(/[<>]/g,'');
					}
				}
				this.utterance.volume = voiceFormData.get('volume'); //always overwrite volume
			}
			window.speechSynthesis.speak(this.utterance);
		})).catch((e) => {
			console.log(e);
			window.speechSynthesis.cancel();
		});
	}
}

function createClickSound(volume=0.5, freq=1000, waveType='sine') {
	const gainNode = audioCtx.createGain();
	gainNode.connect(audioCtx.destination);
	gainNode.gain.setValueAtTime(0, audioCtx.currentTime);

	const osc = audioCtx.createOscillator();
	osc.frequency.value = freq;
	osc.type= waveType;
	osc.connect(gainNode);
	osc.start();

	return {
		play: () => {
			gainNode.gain.setTargetAtTime(volume, audioCtx.currentTime, 0.005);
			gainNode.gain.setTargetAtTime(0, audioCtx.currentTime + 0.020, 0.005);
		}
	};
}

function handleNextMsg(){
	document.querySelector('#nextMsg').animate({opacity: [0, 1]},{duration: 300});
	clickSound.play();
	window.speechSynthesis.cancel(); //is not reliable, sometimes it jumps directly to spoken
	new VoiceMessage('skip to next message is not implemented yet').speak(new FormData(document.querySelector('#statusVoice')))
}
function handlePrevMsg(){
	document.querySelector('#prevMsg').animate({opacity: [0, 1]},{duration: 300});
	clickSound.play();
	window.speechSynthesis.cancel();
	new VoiceMessage('repeat previous message is not implemented yet').speak(new FormData(document.querySelector('#statusVoice')))
}