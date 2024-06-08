const CLIENT_ID = '368mzno8zop311dlixwz4v7qvp0dgz'; /* keep this in sync with hardcoded oauth2/authorize links */
const repeatStreamStatusLiveAfterMS = 1000 * 60 * 5; //5min
const repeatStreamStatusOfflineAfterMS = 1000 * 60 * 1; //1min

let client;
let voices;
let lastStatusSpeekTime = 0;
let lastSpeekTime = 0; 
let lastUserCount = 0;
let lastStreamStatus = undefined;
let voiceOrder;
const voiceDetails = new Map();

function loadSettings() {
	document.querySelector('#channel').value = localStorage.getItem('channel');
	document.querySelector('#startBtn').onclick = start;
	document.querySelector('#stopBtn').onclick = stop;
	if(localStorage.getItem('accessToken')) {
		document.querySelector('#authorizeLabel').innerHTML = '&#x27F3 Update Connection'
		document.querySelector('#channel').removeAttribute('disabled');
		document.querySelector('#startBtn').removeAttribute('disabled');
	}

	if (document.location.hash) {
		var parsedHash = new URLSearchParams(window.location.hash.substr(1));
		history.replaceState({}, '',  window.location.pathname); //hide the accessToken from accidental screen shares
		if (parsedHash.get('access_token')) {
			prefillNameAndChannel(parsedHash.get('access_token'))
		}
	}

	
	loadVoices();
	if (window.speechSynthesis.onvoiceschanged !== undefined) {
		window.speechSynthesis.onvoiceschanged = loadVoices;
	}
	window.addEventListener("beforeunload", preventPageLeave);

	const statusVoiceForm = document.querySelector('#statusVoice');
	statusVoiceForm.onsubmit = testStatusVoice;
	statusVoiceForm.getElementsByTagName('button')[0].removeAttribute('disabled')
	document.querySelectorAll('form[name="chatVoice"]').forEach((chatVoiceForm) => {
		chatVoice.onsubmit = testChatVoice;
		chatVoice.getElementsByTagName('button')[0].removeAttribute('disabled')
	});
}

function preventPageLeave(e) {
	if(client?.ws?.readyState == 1 && !document.querySelector('#stopBtn').disabled) e.preventDefault();
}

function loadVoices() {
	const oldVoiceCount = voices?.length;
	voices = window.speechSynthesis.getVoices();
	const newVoiceCount = voices?.length;
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

async function getStreamStatus(channel){
	const response = await fetch('https://api.twitch.tv/helix/streams?user_login=' + channel,{
		headers: {
			'Client-Id': CLIENT_ID,
			Authorization: 'Bearer ' + localStorage.getItem('accessToken')
		},
		method: 'get'
	});
	const text = await response.text();
	const json = JSON.parse(text);
	console.log(json);
	return json;
}

function checkStreamStatus() {
	const channel = document.querySelector('#channel').value;
	getStreamStatus(channel).then(result => {
		const newTime = new Date();
		let statusMessage = '';
		if(result.data) {
			const newStreamStatus = result.data[0]?.type;
			const newUserCount = result.data[0]?.viewer_count;
			const repeatStreamStatusAfterMS = newStreamStatus=='live' ? repeatStreamStatusLiveAfterMS : repeatStreamStatusOfflineAfterMS;
			if(lastStreamStatus != newStreamStatus) {
				if(newStreamStatus=='live') {
					statusMessage ='Stream got live. ' + newUserCount + ' Viewers';
				} else {
					statusMessage ='Stream got offline';
				}
			}
			if(newTime - lastStatusSpeekTime > repeatStreamStatusAfterMS) {
				if(newStreamStatus=='live') {
					if(newTime - lastSpeekTime > repeatStreamStatusAfterMS) {
						statusMessage += newUserCount + ' Viewers'; //if silent, repeat viewer count as "still alive" ping
					}
				} else {
					statusMessage ='Stream is still offline'; //repeat still offline even if chat is talking
				}
			}
			lastStreamStatus = newStreamStatus;
			lastUserCount = newUserCount;
		} else {
			statusMessage = 'Could not get stream status';
			self.reportError(new Error(`Query for ${channel} result: ` + JSON.stringify(result)));
		}
		if(statusMessage) {
			speak(statusMessage, new FormData(document.querySelector('#statusVoice')), () => lastStatusSpeekTime = newTime);
		}
	});
} 

function prefillNameAndChannel(accessToken){
	fetch('https://api.twitch.tv/helix/users',{
		headers: {
			'Client-Id': CLIENT_ID,
			Authorization: 'Bearer ' + accessToken
		},
		method: 'get'
	}
	).then(function(c) {
		return c.json()
	}).then(function(j) {
		console.log(j);
		localStorage.setItem('accessToken', accessToken);
		document.querySelector('#authorizeLabel').innerHTML = '&#x27F3 Update Connection'
		document.querySelector('#channel').removeAttribute('disabled');
		document.querySelector('#startBtn').removeAttribute('disabled');
		localStorage.setItem('displayName', j.data[0].display_name);
		let channelInput = document.querySelector('#channel');
		if(!channelInput.value) {
			channelInput.value = j.data[0].login;
		}
	}).catch(function(err) {
		self.reportError(new Error(err));
	});
}

function start(e){
	e.target.disabled=true;
	document.querySelector('#stopBtn').removeAttribute('disabled');
	document.querySelectorAll('#connectionForm input').forEach(e => e.disabled = true);
	
	let channel = document.querySelector('#channel').value;
	localStorage.setItem('channel', channel);
	
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

	client.on('message', (channel, user, message, self) => {
		if (self) return;
		if (user['message-type'] === 'chat' || user['message-type'] === 'action') {
			if (window.speechSynthesis.speaking) {
				console.error('SpeechSynthesisUtterance.speaking, skipped message: ' + message);
			} else {
				message = removeEmotesExceptFirst(message, user.emotes);
				message = removeEmojisExceptFirst(message);
				speak(message, new FormData(chatVoice), function () {
					console.log('message was spoken: ' + message);
				});
			}
		}
	});
	
	client.on('cheer', (target, userstate, message) => {
		message = removeEmotesExceptFirst(message, userstate.emotes);
		message = removeEmojisExceptFirst(message);
		message = `cheer ${userstate.bits} bits from ${userstate.username}: "${message}"`;
		speak(message, new FormData(chatVoice), function () {
			console.log('message was spoken: ' + message);
		});
	});
	
	client.on("resub", (channel, username, months, message, userstate, methods) => {
		let cumulativeMonths = ~~userstate["msg-param-cumulative-months"];
		message = removeEmotesExceptFirst(message, userstate.emotes);
		message = removeEmojisExceptFirst(message);
		message = `resub ${cumulativeMonths} month from ${username}: "${message}"`;
		speak(message, new FormData(chatVoice), function () {
			console.log('message was spoken: ' + message);
		});
});
	
	checkStreamStatus();
	setInterval(checkStreamStatus, 5000);
}

function stop(e){
	e.target.disabled=true;
	client.disconnect();
	window.location.reload();
}

function testStatusVoice(e){
	e.submitter.disabled = true;
	const formData = new FormData(e.target);
	speak('Stream Status', formData);
	getStreamStatus(document.querySelector('#channel').value).then(result => {
		let statusMessage = '';
		if(result?.type=='live') {
			statusMessage = 'live with ' + result?.viewer_count + ' Viewers';
		} else {
			statusMessage = 'offline';
		}
		speak(statusMessage, formData, () => e.submitter.disabled = false);
	});

	return false;
}

function testChatVoice(e){
	e.submitter.disabled = true;
	const msg = voiceDetails.get(navigator.language.substr(0,2))?.testUtterance || 'PS VR 2 Twitch Chat';
	speak(msg, new FormData(e.target), () => e.submitter.disabled = false);
	return false;
}


function speak(msg, formData, onEnd) {
	if (msg !== '') {
		lastSpeekTime = new Date();
		const utterThis = new SpeechSynthesisUtterance(msg);

		utterThis.onend = onEnd;

		utterThis.onerror = (event) => {
			console.error(event);
			self.reportError(new Error('Speech error: ' + event.error));
			if(onEnd) onEnd();
		};
		
		const voiceName = formData.get('voice');

		utterThis.voice = voices.find(voice => {return voice.name == voiceName});
		utterThis.volume = formData.get('volume');
		utterThis.pitch = formData.get('pitch');
		utterThis.rate = formData.get('rate');
		window.speechSynthesis.speak(utterThis);
	}
}

function removeEmotesExceptFirst(message, emotes) {
	if (!emotes) {
		return message;
	}
	let newMessage = [...message];
	Object.values(emotes)
		.flat()
		.sort()
		.slice(1) //only keep first emote
		.reverse()
		.map((e) => e.split('-').map(Number))
		.forEach((emoteIndices) => newMessage.splice(emoteIndices[0], emoteIndices[1]+1 - emoteIndices[0]));
	return newMessage.join('');
}

function removeEmojisExceptFirst(string) {
	let alreadyFound = false;
	return string.replace(/\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic})*/gu, match => {
		if (alreadyFound) {
			return ''
		} else {
			alreadyFound = true;
			return match;
		}
	})
}
