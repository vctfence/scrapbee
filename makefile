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
backend-clean:
	cd backend; rm -r -f build
	cd backend; rm -r -f dist
	cd backend; rm -f *.spec

.PHONY: backend-win
backend-win:
	make backend-clean
	cd backend; rm -f *.exe
	cd backend; rm -f *.zip
	echo "DEBUG = False" > ./backend/scrapyard/server_debug.py
	cd backend; pyinstaller scrapyard_backend.py
	mkdir ./backend/dist/scrapyard_backend/scrapyard
	cp -r ./backend/scrapyard/resources ./backend/dist/scrapyard_backend/scrapyard
	cd backend; makensis setup.nsi
	make backend-clean
	echo "DEBUG = True" > ./backend/scrapyard/server_debug.py

.PHONY: backend-cli
backend-cli:
	cd backend; cp -r ./scrapyard ./cli-installer/scrapyard_backend/
	echo "DEBUG = False" > ./backend/cli-installer/scrapyard_backend/scrapyard/server_debug.py
	cd backend; cp -r ./manifests ./cli-installer/scrapyard_backend/
	cd backend; rm -r -f ./cli-installer/scrapyard_backend/manifests/debug_manifest*
	cd backend; cp -r ./setup.py ./cli-installer/scrapyard_backend/
	cd backend; rm -f scrapyard-backend.tgz
	cd backend; 7za.exe a -ttar -so -an ./cli-installer/* -xr!__pycache__ | 7za.exe a -si scrapyard-backend.tgz
	cd backend; rm ./cli-installer/scrapyard_backend/setup.py
	cd backend; rm -r -f ./cli-installer/scrapyard_backend/scrapyard
	cd backend; rm -r -f ./cli-installer/scrapyard_backend/manifests
