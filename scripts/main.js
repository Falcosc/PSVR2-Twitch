const clientId = '368mzno8zop311dlixwz4v7qvp0dgz'; /* keep this in sync with hardcoded oauth2/authorize links */
const synth = window.speechSynthesis;
var voices;

function loadSettings() {
	if (document.location.hash) {
		var parsedHash = new URLSearchParams(window.location.hash.substr(1));
		if (parsedHash.get('access_token')) {
			let accessToken = parsedHash.get('access_token');
			document.getElementById('accessToken').value = accessToken;
			prefillNameAndChannel(accessToken)
		}
	}
	
	document.getElementById('startBtn').onclick=start;
	document.getElementById('startBtn').removeAttribute('disabled');
	document.getElementById('stopBtn').onclick=stop;
	
	loadVoices();
	if (synth.onvoiceschanged !== undefined) {
	  synth.onvoiceschanged = loadVoices;
	}

	let statusVoiceForm = document.getElementById('statusVoice');
	statusVoiceForm.onsubmit = testStatusVoice;
	statusVoiceForm.getElementsByTagName('button')[0].removeAttribute('disabled')
	document.querySelectorAll('form[name="chatVoice"]').forEach((chatVoiceForm) => {
		chatVoice.onsubmit = testChatVoice;
		chatVoice.getElementsByTagName('button')[0].removeAttribute('disabled')
	});
}

function loadVoices() {
	voices = synth.getVoices();
	let voiceSelects = document.querySelectorAll('select[name="voice"]');
	voiceSelects.forEach((selectElement) => selectElement.innerHTML = "");
	voices.forEach((voice) => {
		const option = document.createElement("option");
		option.value = voice.name;
		option.textContent = `${voice.name} (${voice.lang})`;
		if (voice.default) {
			option.textContent += " -- DEFAULT";
		}
		option.setAttribute("data-lang", voice.lang);
		option.setAttribute("data-name", voice.name);
		voiceSelects.forEach((selectElement) => selectElement.appendChild(option.cloneNode(true)));
	});
}

function prefillNameAndChannel(accessToken){
	fetch("https://api.twitch.tv/helix/users",{
		headers: {
			'Client-Id': clientId,
			Authorization: 'Bearer ' + accessToken
		},
		method: 'get'
	}
	).then(function(c) {
		return c.json()
	}).then(function(j) {
		console.log(j);
		let displayNameInput = document.getElementById('displayName');
		let channelInput = document.getElementById('channel');
		if(!displayNameInput.value) {
			displayNameInput.value = j.data[0].display_name;
		}
		if(!channelInput.value) {
			channelInput.value = j.data[0].login;
		}
	}).catch(function(err) {
		console.log('e', err);
	});
}

function start(e){
	e.target.disabled=true;
	document.getElementById('stopBtn').removeAttribute('disabled');
	document.querySelectorAll('form > *').forEach(e => e.disabled = true);
	
	let accessToken = document.getElementById("accessToken").value;
	localStorage.setItem("accessToken", accessToken);
	let displayName = document.getElementById('displayName').value;
	localStorage.setItem("displayName", displayName);
	let channel = document.getElementById("channel").value;
	localStorage.setItem("channel", channel);
	
	const client = new tmi.Client({
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

	const chatForm = document.querySelectorAll('form[name="chatVoice"]')[0];

	client.on('message', (channel, user, message, self) => {
		if (self) return;
		if (user['message-type'] === 'chat') {
			speak(message, new FormData(chatForm), function () {
				console.log('message was spoken: ' + message);
			});
		}
	});
}

function stop(e){
	e.target.disabled=true;
	window.location.reload();
}

function testStatusVoice(e){
	e.submitter.disabled=true;
	speak('Test Stream status, but this is currently not implemented.', new FormData(e.target), function (event) {
		e.submitter.disabled=false;
	});
	e.submitter.disabled=false;
	return false;
}

function testChatVoice(e){
	e.submitter.disabled=true;
	speak('PS VR 2 Twitch Chat', new FormData(e.target), function (event) {
		e.submitter.disabled=false;
	});
	return false;
}


function speak(msg, formData, onEnd) {
	if (synth.speaking) {
		console.error("speechSynthesis.speaking, skipped message: " + msg);
		return;
	}
	if (msg !== "") {
		const utterThis = new SpeechSynthesisUtterance(msg);

		utterThis.onend = onEnd;

		utterThis.onerror = function (event) {
			console.error("SpeechSynthesisUtterance.onerror");
		};

		const voiceName = formData.get("voice");

		utterThis.voice = voices.find(voice => {return voice.name == voiceName});
		utterThis.volume = formData.get("volume");
		utterThis.pitch = formData.get("pitch");
		utterThis.rate = formData.get("rate");
		synth.speak(utterThis);
	}
}
