#!/bin/bash
chmod +x scrapbee_backend

dest="${HOME}/.mozilla/native-messaging-hosts"

if [ ! -d "$dest" ];then
      mkdir -p "$dest"
fi

cp scrapbee_backend.json "$dest"

echo "done"
