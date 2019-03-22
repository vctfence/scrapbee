test:
	cd addon; start web-ext run -p "%APPDATA%/Mozilla/Firefox/Profiles/debug" --keep-profile-changes --browser-console

sign:
	cd addon; web-ext sign -i creds web-ext-artifacts screen.png logo.jpg *.md *.iml updates.json `cat $(HOME)/.amo/creds`
