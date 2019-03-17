#!/bin/bash
chmod +x scrapbee_backend

dest="${HOME}/Library/Application Support/Mozilla/NativeMessagingHosts"

if [ ! -d "$dest" ];then
      mkdir -p "$dest"
fi

cp scrapbee_backend.json "$dest"

echo "done"


