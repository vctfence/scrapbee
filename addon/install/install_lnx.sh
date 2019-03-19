#!/bin/bash
chmod +x scrapyard_backend

dest="${HOME}/.mozilla/native-messaging-hosts"

if [ ! -d "$dest" ];then
      mkdir -p "$dest"
fi

cp scrapyard_backend.json "$dest"

echo "done"
