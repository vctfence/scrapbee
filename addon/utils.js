async function scriptsAllowed(tabId, frameId = 0) {
    try {
        await browser.tabs.executeScript(tabId, {
            frameId: frameId,
            runAt: 'document_start',
            code: 'true;'
        });
        return true;
    } catch (e) {}
}

function showNotification({message, title='', type = 'info'}) {
    return browser.notifications.create(`sbi-notification-${type}`, {
        type: 'basic',
        title: title,
        message: message,
        iconUrl: '/icons/scrapyard.svg'
    });
}

function pathToNameExt(fullPath) {

    let startIndex = (fullPath.indexOf('\\') >= 0 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/'));
    let dotIndex = fullPath.lastIndexOf('.');
    let file_name = fullPath.substring(startIndex, dotIndex);
    let file_ext = fullPath.substring(dotIndex + 1);

    if (file_name.indexOf('\\') === 0 || file_name.indexOf('/') === 0) {
        file_name = file_name.substring(1);
    }

    return {name: file_name, ext: file_ext};
}

export{scriptsAllowed, showNotification, pathToNameExt};
