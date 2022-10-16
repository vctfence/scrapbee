import {settings} from "../../settings.js";
import {setSaveCheckHandler} from "../options.js"
import {oneDriveClient} from "../../cloud_client_onedrive.js";
import {dropboxClient} from "../../cloud_client_dropbox.js";
import {send} from "../../proxy.js";

async function configureCloudSettingsPage() {
    const dropboxRadio = $("#provider-dropbox");
    const oneDriveRadio = $("#provider-onedrive");

    let activeProvider;
    if (settings.active_cloud_provider() === oneDriveClient.ID)
        activeProvider = oneDriveClient;
    else
        activeProvider = dropboxClient;

    $("input[name=cloud-providers][value=" + activeProvider.ID + "]").prop('checked', true);

    async function setActiveProvider(provider) {
        activeProvider = provider;
        await settings.active_cloud_provider(activeProvider.ID);
        await send.cloudProviderChanged({provider: activeProvider.ID});
        if (activeProvider.isAuthenticated())
            send.shelvesChanged({synchronize: true})
    }

    dropboxRadio.on("change", e => setActiveProvider(dropboxClient));
    oneDriveRadio.on("change", e => setActiveProvider(oneDriveClient));

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

    if (dropboxClient.isAuthenticated())
        $(`#auth-dropbox`).val("Sign out");
    if (oneDriveClient.isAuthenticated())
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

    $("#auth-dropbox").on("click", providerAuthHandler(dropboxClient));
    $("#auth-onedrive").on("click", providerAuthHandler(oneDriveClient));
}

export async function load() {
    await configureCloudSettingsPage();
}
