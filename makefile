test:
	cd addon; start web-ext run -p "%APPDATA%/Mozilla/Firefox/Profiles/debug" --keep-profile-changes --browser-console

build:
	cd addon; web-ext build -i creds web-ext-artifacts .web-extension-id screen.png logo.jpg *.md *.iml updates.json

sign:
	cd addon; web-ext sign -i creds web-ext-artifacts .web-extension-id screen.png logo.jpg *.md *.iml updates.json `cat $(HOME)/.amo/creds`
