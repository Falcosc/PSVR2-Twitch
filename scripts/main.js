const CLIENT_ID = '368mzno8zop311dlixwz4v7qvp0dgz'; /* keep this in sync with hardcoded oauth2/authorize links */
const repeatStreamStatusLiveAfterMS = 1000 * 60 * 5; //5min
const repeatStreamStatusOfflineAfterMS = 1000 * 60 * 1; //1min

let client;
let voices;
let lastStatusSpeekTime = 0;
let lastSpeekTime = 0; 
let lastUserCount = 0;
let lastStreamStatus = undefined;

function loadSettings() {
	document.querySelector('#accessToken').value = localStorage.getItem('accessToken');
	document.querySelector('#displayName').value = localStorage.getItem('displayName');
	document.querySelector('#channel').value = localStorage.getItem('channel');

	if (document.location.hash) {
		var parsedHash = new URLSearchParams(window.location.hash.substr(1));
		history.replaceState({}, '',  window.location.pathname); //hide the accessToken from accidental screen shares
		if (parsedHash.get('access_token')) {
			let accessToken = parsedHash.get('access_token');
			document.querySelector('#accessToken').value = accessToken;
			prefillNameAndChannel(accessToken)
		}
	}
	
	document.querySelector('#startBtn').onclick=start;
	document.querySelector('#startBtn').removeAttribute('disabled');
	document.querySelector('#stopBtn').onclick=stop;
	
	loadVoices();
	if (window.speechSynthesis.onvoiceschanged !== undefined) {
		window.speechSynthesis.onvoiceschanged = loadVoices;
	}

	const statusVoiceForm = document.querySelector('#statusVoice');
	statusVoiceForm.onsubmit = testStatusVoice;
	statusVoiceForm.getElementsByTagName('button')[0].removeAttribute('disabled')
	document.querySelectorAll('form[name="chatVoice"]').forEach((chatVoiceForm) => {
		chatVoice.onsubmit = testChatVoice;
		chatVoice.getElementsByTagName('button')[0].removeAttribute('disabled')
	});
}

function loadVoices() {
	voices = window.speechSynthesis.getVoices();
	console.log(voices);
	if(!voices?.length > 0){
		return;
	}
	let voiceSelects = document.querySelectorAll('select[name="voice"]');
	voiceSelects.forEach((selectElement) => selectElement.innerHTML = '');
	voices.forEach((voice) => {
		const option = document.createElement('option');
		option.value = voice.name;
		option.textContent = `${voice.name} (${voice.lang})`;
		option.setAttribute('data-lang', voice.lang);
		option.setAttribute('data-name', voice.name);
		voiceSelects.forEach((selectElement) => selectElement.appendChild(option.cloneNode(true)));
	});

	document.querySelector('#statusVoice [name=voice]').value=voices?.find((v) => v.lang.includes('en'))?.name;
	// [...document.querySelector('#statusVoice [name=voice]').options].map(o => o.value).includes(voiceFromSettings) 
}

async function getStreamStatus(channel){
		const response = await fetch('https://api.twitch.tv/helix/streams?user_login=' + channel,{
			headers: {
				'Client-Id': CLIENT_ID,
				Authorization: 'Bearer ' + document.querySelector('#accessToken').value
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
		let displayNameInput = document.querySelector('#displayName');
		let channelInput = document.querySelector('#channel');
		if(!displayNameInput.value) {
			displayNameInput.value = j.data[0].display_name;
		}
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
	
	let accessToken = document.querySelector('#accessToken').value;
	localStorage.setItem('accessToken', accessToken);
	let displayName = document.querySelector('#displayName').value;
	localStorage.setItem('displayName', displayName);
	let channel = document.querySelector('#channel').value;
	localStorage.setItem('channel', channel);
	
	client = new tmi.Client({
		options: {
			debug: true,
			skipUpdatingEmotesets: true
		},
		connection: {reconnect: true},
		identity: {
			username: displayName,
			password: 'oauth:' + accessToken
		},
		channels: [channel]
	});

	client.connect().catch(console.error);

	const chatVoice = document.querySelectorAll('form[name="chatVoice"]')[0];
	
	//TODO on "cheer" get bits
	//TODO on "subgift" get gift subs
	//TODO on "submysterygift" get gift subs

	client.on('message', (channel, user, message, self) => {
		console.log(message);
		if (self) return;
		if (user['message-type'] === 'chat') {
			if (window.speechSynthesis.speaking) {
				console.error('SpeechSynthesisUtterance.speaking, skipped message: ' + msg);
			} else {
				speak(message, new FormData(chatVoice), function () {
					console.log('message was spoken: ' + message);
				});
			}
		}
	});
	checkStreamStatus();
	setInterval(checkStreamStatus, 5000);
}

function stop(e){
	e.target.disabled=true;
	window.location.reload();
}

function testStatusVoice(e){
	e.submitter.disabled=true;
	const formData = new FormData(e.target);
	speak('Stream Status', formData);
	getStreamStatus(document.querySelector('#channel').value).then(result => {
		let statusMessage = '';
		if(result?.type=='live') {
			statusMessage ='live with ' + result?.viewer_count + ' Viewers';
		} else {
			statusMessage ='offline';
		}
		speak(statusMessage, formData, () => e.submitter.disabled=false);
	});

	return false;
}

function testChatVoice(e){
	e.submitter.disabled=true;
	speak('PS VR 2 Twitch Chat', new FormData(e.target), function () {
		e.submitter.disabled=false;
	});
	return false;
}


function speak(msg, formData, onEnd) {
	if (msg !== '') {
		lastSpeekTime = new Date();
		const utterThis = new SpeechSynthesisUtterance(msg);

		utterThis.onend = onEnd;

		utterThis.onerror = function (event) {
			console.error('SpeechSynthesisUtterance.onerror');
		};

		const voiceName = formData.get('voice');

		utterThis.voice = voices.find(voice => {return voice.name == voiceName});
		utterThis.volume = formData.get('volume');
		utterThis.pitch = formData.get('pitch');
		utterThis.rate = formData.get('rate');
		window.speechSynthesis.speak(utterThis);
	}
}
