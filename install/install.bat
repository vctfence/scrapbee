chcp 65001

reg delete "HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\scrapbee_backend" /f 
reg add "HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\scrapbee_backend" /d %USERPROFILE%\Downloads\scrapbee\scrapbee_backend.json /f

reg delete "HKEY_LOCAL_MACHINE\SOFTWARE\Mozilla\NativeMessagingHosts\scrapbee_backend" /f 
reg add "HKEY_LOCAL_MACHINE\SOFTWARE\Mozilla\NativeMessagingHosts\scrapbee_backend" /d %USERPROFILE%\Downloads\scrapbee\scrapbee_backend.json /f

echo done
pause
