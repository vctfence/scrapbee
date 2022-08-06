#!/bin/sh
if [ `id -u` -eq 0 ]
  then echo "Please run in a non-elevated shell."
  exit
fi

python3 ./scrapyard_helper/installer.py
