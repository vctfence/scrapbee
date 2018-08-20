reg delete "HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\scrapbee_backend" /f 
reg add "HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\scrapbee_backend" /d %USERPROFILE%\Downloads\scrapbee\scrapbee_backend.json /f

echo done
pause
