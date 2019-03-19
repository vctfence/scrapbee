#!/bin/bash
chmod +x scrapyard_backend

dest="${HOME}/Library/Application Support/Mozilla/NativeMessagingHosts"

if [ ! -d "$dest" ];then
      mkdir -p "$dest"
fi

cp scrapyard_backend.json "$dest"

echo "done"


