import {settings} from "../../settings.js";
import {setSaveCheckHandler} from "../options.js"
import {oneDriveBackend} from "../../backend_onedrive.js";
import {dropboxBackend} from "../../backend_dropbox.js";
import {send} from "../../proxy.js";

async function configureCloudSettingsPage() {
    const dropboxRadio = $("#provider-dropbox");
    const oneDriveRadio = $("#provider-onedrive");

    let activeProvider;
    if (settings.active_cloud_provider() === oneDriveBackend.ID)
        activeProvider = oneDriveBackend;
    else
        activeProvider = dropboxBackend;

    $("input[name=cloud-providers][value=" + activeProvider.ID + "]").prop('checked', true);

    async function setActiveProvider(provider) {
        activeProvider = provider;
        await settings.active_cloud_provider(activeProvider.ID);
        await send.cloudProviderChanged({provider: activeProvider.ID});
        if (activeProvider.isAuthenticated())
            send.shelvesChanged({synchronize: true})
    }

    dropboxRadio.on("change", e => setActiveProvider(dropboxBackend));
    oneDriveRadio.on("change", e => setActiveProvider(oneDriveBackend));

    const enableCloudCheck = $("#option-enable-cloud");
    enableCloudCheck.prop("checked", settings.cloud_enabled());
    enableCloudCheck.on("change", async e => {
        await settings.load();
        await settings.cloud_enabled(e.target.checked);

        if (e.target.checked) {
            const success = await activeProvider.authenticate();
            if (success)
                $(`#auth-${activeProvider.ID}`).val("Sign out");
        }
        send.reconcileCloudBookmarkDb()
    });

    $("#option-cloud-background-sync").prop("checked", settings.cloud_background_sync());
    await setSaveCheckHandler("option-cloud-background-sync", "cloud_background_sync", async e => {
        send.enableCloudBackgroundSync({enable: e.target.checked});
    });

    if (dropboxBackend.isAuthenticated())
        $(`#auth-dropbox`).val("Sign out");
    if (oneDriveBackend.isAuthenticated())
        $(`#auth-onedrive`).val("Sign out");

    function providerAuthHandler(provider) {
        return async () => {
            if (provider.isAuthenticated())
                await provider.signOut();
            else
                await provider.authenticate();

            $(`#auth-${provider.ID}`).val(provider.isAuthenticated()? "Sign out": "Sign in");
        };
    }

    $("#auth-dropbox").on("click", providerAuthHandler(dropboxBackend));
    $("#auth-onedrive").on("click", providerAuthHandler(oneDriveBackend));
}

export async function load() {
    await configureCloudSettingsPage();
}
