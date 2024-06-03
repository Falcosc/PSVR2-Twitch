# Twitch Chat TTS for VR

Everything which is not adjustable in existing text to speech solutions need to be custom coded. That's why this tool was created

Everybody can directly use the Web Version in your favorite Web Browser:

[PSVR2-Twitch Chat](https://falcosc.github.io/PSVR2-Twitch/)

# Usage suggestions
Since you don't want this audio to feed into your Stream, a secondary device is the easiest way to consume the audio.

During playing around with the voices, I found out that Microsoft included a huge amount of Voices in Microsoft Edge to Windows.
This will become useful as soon as we add the feature of rotating voices to differentiate between chat users.
Default voices in Safari are the worst I have heard to far, you should install Enhanced/Premium voices on Apple devices to use it.

If you don't want to wait until your idea gets merged or if you just want to try out some script adjustments, you can just download the files and launch it from your file system instead.

# Nothing will be stored online
The tool uses your browser storage to save the settings. All communications happen on your device over JS. Some browsers use online services for text to speech. For that reason, this tool only says public chat messages or public server stats and does not consume private messages.

# Why PSVR2
In contrast to any other VR solution, missing features and customization on PlayStation does compromise the enjoyment so much that I needed to create a custom solution.
- PSVR2 still has no support for chat overlay
- You can't get the PS5 internet browser open in parallel to your game in VR
- Games don't ship with Twitch chat integrations
- You can't mod games on PlayStation 5
- You can't develop extensions for anything in the PlayStation environment to get any help in VR

# Not needed for other VR solutions
Any other product I know either already has better integrations or provide the ability to extend the capabilities.
I don't recommend using this tool for other VR solutions. If you are not on PSVR2 I suggest checking for existing solutions even if there is nothing out of the box. Any other VR Solution has lots of abilities to get extended, so it is just a matter of time until you find a way better twitch chat solution for your VR system.

# Why Text To Speech
text to speech is the worst solution for public chat. But because PlayStation is a closed system without any abilities to be extended, audio is the only interface which can be used to get information while in VR.

# What is different to PS5 Text to Speech or other TTS Solutions?
This tool tries to mimic the interaction with an automatic scrolling chat. 
Here are some notes about how I consume chat, these are topics which are missing in PS5 Twitch TTS integration and other TTS tools
- don't constantly read chat messages
- read the latest most up-to-date chat messages first for live interaction
- ignore old messages if too many new ones come in (chat scrolls automatically)
- differentiate user messages from each other without reading the name (they are colorful in chat, no need to read each name)
- checking if my stream is still online or if there is any issue with the output
- skip nonsense messages
- skip spam

As long as I can't get these behaviors adapted to TTS I need to add them to my tool in the order of my personal need.
I still hope that Sony will extend PSVR2 in the future, so I only focus on the most annoying topics first.

# How can we mimic how humans consume with chat messages?
These are my ideas so far, some of them are already implemented:
- skip chat messages and only read the latest one to interact with game state relevant fresh live comments
- force x seconds long pauses after y seconds of speech to steer the balance of game consumption with chat consumption
- rotate voices to differentiate users without dealing with usernames
- control which messages get skipped by user type
- control which messages get skipped by the amount of consumed messages per user to force hearing things from others
- skip messages with repeated phrases
- skip excessively long phrases
- skip equal messages
- use natural language processing frameworks to score the content of a message to skip less meaningful messages

# Which of these features are currently implemented?
- skip chat messages and only read the latest one to interact with game state relevant fresh live comments
- notification if my streaming system stops working and the stream goes offline (without viewers nobody will inform you if your recording breaks) checks status every 5 seconds
- audio ping every x minutes in periods of silence to notify that everything is still working
- notification about viewers, no need to talk to my self if I just record for my self.
- translate only one emoji per message

If you are interested in more, just share your ideas:
https://github.com/Falcosc/PSVR2-Twitch/discussions

If more people like your ideas and wishes, it makes more sense to work on them together.

# What will be implemented next?
It depends on your feedback. Currently, I only work on my needs which are tiny since I only stream to be able to save funny moments without the hassle of managing large amounts of data at home and without the trouble of how to share these funny moments with my friends.
Since I like coding, it only takes a cool idea and seeing how much you enjoy the process of using it to add some easy features for your needs into this tool.
But be aware, it will get obsolete as soon as Sony adds a real chat in PSVR2. So let's focus on things we need today and don't waste time on things which might be interested in the future.
For example, PSVR1 already had a good enough integration to be happy with this workaround: https://github.com/teklynk/twitch_chat_forwarder/

# License

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

This project is licensed under the GNU GPL License - see the [LICENSE](LICENSE) file for details.