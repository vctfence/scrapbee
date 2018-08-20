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
    iconUrl: '/icons/bee.png'
  });
}
export{scriptsAllowed, showNotification};
