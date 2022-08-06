# uses git shell

test:
	cd addon; start web-ext run -p "$(HOME)/../firefox/debug.scrapyard" --keep-profile-changes

test-nightly:
	cd addon; start web-ext run -p "$(HOME)/../firefox/debug.scrapyard.nightly" --firefox=nightly --keep-profile-changes

build:
	cd addon; web-ext build -i web-ext-artifacts .web-extension-id _metadata

build-chrome:
	rm -f Scrapyard.zip
	7za a Scrapyard.zip ./addon/* -xr!web-ext-artifacts -xr!.web-extension-id -xr!_metadata -xr!*.mv2* -xr!*.mv3*

sign:
	cd addon; web-ext sign -i web-ext-artifacts .web-extension-id _metadata `cat $(HOME)/.amo/creds`

.PHONY: firefox-mv2
firefox-mv2:
	cd addon; cp manifest.json.mv2 manifest.json

.PHONY: firefox-mv3
firefox-mv3:
	cd addon; cp manifest.json.mv3 manifest.json

.PHONY: chrome-mv3
chrome-mv3:
	cd addon; cp manifest.json.mv3.chrome manifest.json

.PHONY: helper-win
helper-win:
	cd helper; rm -r -f build
	cd helper; rm -r -f dist
	cd helper; rm -f *.exe
	cd helper; rm -f *.zip
	cd helper; rm -f *.spec
	cd helper; pyinstaller scrapyard_helper.py
	mkdir ./helper/dist/scrapyard_helper/scrapyard
	cp ./helper/scrapyard/scrapyard.png ./helper/dist/scrapyard_helper/scrapyard/scrapyard.png
	cd helper; makensis setup.nsi

.PHONY: helper-cli
helper-cli:
	cd helper; cp -r ./scrapyard ./cli-installer/scrapyard_helper/
	cd helper; cp -r ./manifests ./cli-installer/scrapyard_helper/
	cd helper; rm -r ./cli-installer/scrapyard_helper/manifests/debug_manifest*
	cd helper; cp -r ./setup.py ./cli-installer/scrapyard_helper/
	cd helper; rm scrapyard-helper.tgz
	cd helper; 7za.exe a -ttar -so -an ./cli-installer/* -xr!__pycache__ | 7za.exe a -si scrapyard-helper.tgz
	cd helper; rm ./cli-installer/scrapyard_helper/setup.py
	cd helper; rm -r ./cli-installer/scrapyard_helper/scrapyard
	cd helper; rm -r ./cli-installer/scrapyard_helper/manifests
