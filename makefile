# uses git shell

test:
	cd addon; start web-ext run -p "$(HOME)/../firefox/debug.scrapyard" --keep-profile-changes

test-nightly:
	cd addon; start web-ext run -p "$(HOME)/../firefox/debug.scrapyard.nightly" --firefox=nightly --keep-profile-changes


.PHONY: build
build:
	cd addon; python ../scripts/mkmanifest.py manifest.json.mv2 manifest.json `cat version.txt` --public
	cd addon; web-ext build -a ../build -i web-ext-artifacts .web-extension-id _metadata version.txt
	make firefox-mv2

.PHONY: build-chrome
build-chrome:
	make chrome-mv3
	rm -f build/scrapyard-chrome-*.zip
	7za a build/scrapyard-chrome-`cat ./addon/version.txt`.zip ./addon/* -xr!web-ext-artifacts -xr!.web-extension-id -xr!_metadata -xr!*.mv2* -xr!*.mv3*

sign:
	make firefox-mv2
	cd addon; web-ext sign -a ../build -i web-ext-artifacts .web-extension-id _metadata version.txt `cat $(HOME)/.amo/creds`

.PHONY: firefox-mv2
firefox-mv2:
	cd addon; python ../scripts/mkmanifest.py manifest.json.mv2 manifest.json `cat version.txt`

.PHONY: firefox-mv3
firefox-mv3:
	cd addon; python ../scripts/mkmanifest.py manifest.json.mv3 manifest.json `cat version.txt`

.PHONY: chrome-mv3
chrome-mv3:
	cd addon; python ../scripts/mkmanifest.py manifest.json.mv3.chrome manifest.json `cat version.txt`

.PHONY: helper-clean
helper-clean:
	cd helper; rm -r -f build
	cd helper; rm -r -f dist
	cd helper; rm -f *.spec

.PHONY: helper-win
helper-win:
	make helper-clean
	cd helper; rm -f *.exe
	cd helper; rm -f *.zip
	echo "DEBUG = False" > ./helper/scrapyard/server_debug.py
	cd helper; pyinstaller scrapyard_helper.py
	mkdir ./helper/dist/scrapyard_helper/scrapyard
	cp -r ./helper/scrapyard/resources ./helper/dist/scrapyard_helper/scrapyard
	cd helper; makensis setup.nsi
	make helper-clean
	echo "DEBUG = True" > ./helper/scrapyard/server_debug.py

.PHONY: helper-cli
helper-cli:
	cd helper; cp -r ./scrapyard ./cli-installer/scrapyard_helper/
	echo "DEBUG = False" > ./helper/cli-installer/scrapyard_helper/scrapyard/server_debug.py
	cd helper; cp -r ./manifests ./cli-installer/scrapyard_helper/
	cd helper; rm -r -f ./cli-installer/scrapyard_helper/manifests/debug_manifest*
	cd helper; cp -r ./setup.py ./cli-installer/scrapyard_helper/
	cd helper; rm -f scrapyard-helper.tgz
	cd helper; 7za.exe a -ttar -so -an ./cli-installer/* -xr!__pycache__ | 7za.exe a -si scrapyard-helper.tgz
	cd helper; rm ./cli-installer/scrapyard_helper/setup.py
	cd helper; rm -r -f ./cli-installer/scrapyard_helper/scrapyard
	cd helper; rm -r -f ./cli-installer/scrapyard_helper/manifests
