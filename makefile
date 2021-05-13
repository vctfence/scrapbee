# uses git shell

test:
	cd addon; start web-ext run -p "$(HOME)/../firefox/debug.scrapyard" --keep-profile-changes

build:
	cd addon; web-ext build -i web-ext-artifacts .web-extension-id debug.log

sign:
	cd addon; web-ext sign -i web-ext-artifacts .web-extension-id debug.log `cat $(HOME)/.amo/creds`

.PHONY: helper
helper:
	cd helper; rm -r -f build
	cd helper; rm -r -f dist
	cd helper; rm -f *.exe
	cd helper; rm -f *.zip
	cd helper; rm -f *.spec
	cd helper; pyinstaller scrapyard_helper.py
	cd helper; makensis setup.nsi
