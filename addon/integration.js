
function isExtensionLocal() {
    let id = browser.runtime.getManifest().applications?.gecko?.id;

    if (id)
        return !id.includes("-we");

    return false;
}

let ISHELL_ID = `ishell${isExtensionLocal()? "": "-we"}@gchristensen.github.io`

let iShellInvalidationEnabled = true;

// should be used only in background code
export function iShellEnableInvalidation(enable) {
    iShellInvalidationEnabled = enable;
}

export function iShellInvalidateCompletion() {
    if (iShellInvalidationEnabled)
        browser.runtime.sendMessage(ISHELL_ID, {type: "SCRAPYARD_INVALIDATE_COMPLETION"});
}

