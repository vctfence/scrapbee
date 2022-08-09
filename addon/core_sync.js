import {receive, send} from "./proxy.js";
import {settings} from "./settings.js";
import {Node} from "./storage_entities.js";
import {nativeBackend} from "./backend_native.js";
import {ACTION_ICONS, showNotification} from "./utils_browser.js";
import {DEFAULT_SHELF_UUID, NON_SYNCHRONIZED_EXTERNALS, isNodeHasContent} from "./storage.js";
import {SYNC_VERSION} from "./marshaller_json.js";
import {ProgressCounter} from "./utils.js";
import {MarshallerSync, UnmarshallerSync} from "./marshaller_sync.js";

const SYNC_ALARM_NAME = "sync-alarm";
const SYNC_ALARM_PERIOD = 60;

let syncing = false;

receive.checkSyncDirectory = async message => {
    try {
        send.startProcessingIndication({noWait: true});
        const helperApp = await nativeBackend.hasVersion("0.5", "Scrapyard helper application 0.5+ is required for this feature.");

        if (helperApp) {
            const status = await nativeBackend.jsonPost("/sync/check_directory",
                {sync_directory: message.sync_directory});

            if (status)
                return status.status;
        }
    }
    finally {
        send.stopProcessingIndication();
    }
};

receive.performSync = async message => {
    send.startProcessingIndication({noWait: true});

    try {
        await performSync(message.isInitial);
    }
    finally {
        send.stopProcessingIndication();
        send.shelvesChanged();
    }
};

receive.enableBackgroundSync = async message => enableBackgroundSync(message.enable);

async function enableBackgroundSync(enable) {
    if (enable) {
        const alarm = await browser.alarms.get(SYNC_ALARM_NAME);
        if (!alarm)
            browser.alarms.create(SYNC_ALARM_NAME, {periodInMinutes: SYNC_ALARM_PERIOD});
    }
    else {
        browser.alarms.clear(SYNC_ALARM_NAME);
    }
}

browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === SYNC_ALARM_NAME)
        performSync();
});

async function performSync(initial) {
    await settings.load();

    if (syncing || !settings.sync_enabled() || !await nativeBackend.probe(true))
        return;

    if (initial)
        settings.last_sync_date(null);

    const sync_directory = settings.sync_directory();

    try {
        syncing = true;

        if (!await isSynchronizationPossible(sync_directory, initial)) {
            syncing = false;
            return;
        }

        const syncNodes = await getNodesForSync();
        const syncParams = {
            sync_directory,
            nodes: JSON.stringify(syncNodes),
            last_sync_date: settings.last_sync_date() || -1
        };

        const syncOperations = await nativeBackend.jsonPost("/sync/compute", syncParams);

        if (!syncOperations) {
            showNotification("Synchronization could not be performed because of an error.");
            syncing = false;
            return;
        }

        syncOperations.initial = initial;

        if (areChangesPresent(syncOperations)) {
            const action = _MANIFEST_V3? browser.action: browser.browserAction;

            if (settings.platform.firefox)
                action.setIcon({path: "/icons/action-sync.svg"});
            else
                action.setIcon({path: "/icons/action-sync.png"});

            try {
                await performOperations(syncOperations, sync_directory);
            }
            finally {
                if (settings.platform.firefox)
                    action.setIcon({path: "/icons/scrapyard.svg"});
                else
                    action.setIcon({path: ACTION_ICONS});
            }
        }
        else if (initial)
            send.syncProgress({progress: 100});
    }
    finally {
        syncing = false;
    }
}

async function isSynchronizationPossible(sync_directory, initial) {
    const syncProperties = await nativeBackend.jsonPost("/sync/get_metadata", {sync_directory});

    if (!syncProperties || syncProperties.error === "error") {
        showNotification("Error initializing synchronization.");
        return false;
    }
    else if (!initial && (syncProperties.error === "empty" || !syncProperties.entities)) {
        showNotification("Cannot synchronize with an empty or read-only database.");
        return false;
    }
    else if (syncProperties.version > SYNC_VERSION) {
        showNotification("Synchronization is impossible. Please update the add-on and the helper application.");
        return false;
    }

    return true;
}

function areChangesPresent(syncOperations) {
    //console.log(syncOperations);

    const changes = syncOperations.push.length
        || syncOperations.pull.length
        || syncOperations.delete.length
        || syncOperations.delete_in_sync.length;

    return !!changes;
}

async function getNodesForSync() {
    const id2uuid = new Map();
    const nodes = (await Node.get()).filter(n => !NON_SYNCHRONIZED_EXTERNALS.some(ex => ex === n.external));

    for (let node of nodes)
        id2uuid.set(node.id, node.uuid);

    const syncNodes = [];

    for (let node of nodes) {
        const syncNode = {
            uuid: node.uuid,
            date_modified: node.date_modified,
            content_modified: node.content_modified
        };

        if (node.parent_id)
            syncNode.parent_id = id2uuid.get(node.parent_id);

        if (syncNode.date_modified && syncNode.date_modified instanceof Date)
            syncNode.date_modified = syncNode.date_modified.getTime();
        else
            syncNode.date_modified = 0;

        if (!node.content_modified && isNodeHasContent(node))
            syncNode.content_modified = syncNode.date_modified;
        else if (syncNode.content_modified)
            syncNode.content_modified = syncNode.content_modified.getTime();

        syncNodes.push(syncNode);
    }

    const defaultShelf = syncNodes.find(n => n.uuid === DEFAULT_SHELF_UUID);
    if (defaultShelf)
        defaultShelf.date_modified = 0;

    return syncNodes;
}

async function performOperations(syncOperations, sync_directory) {
    await nativeBackend.post("/sync/open_session", {sync_directory});

    let errors = false;

    try {
        await deleteSyncNodes(syncOperations.delete_in_sync);
    }
    catch (e) {
        errors = true;
        console.error(e);
    }

    const total = syncOperations.push.length + syncOperations.pull.length + syncOperations.delete.length;
    const progress = new ProgressCounter(total, "syncProgress");

    const syncMarshaller = new MarshallerSync(nativeBackend, syncOperations.initial);
    for (const syncNode of syncOperations.push)
        try {
            await syncMarshaller.marshal(syncNode);
            progress.incrementAndNotify();
        }
        catch (e) {
            errors = true;
            console.error(e);
        }

    const syncUnmarshaller = new UnmarshallerSync(nativeBackend);
    for (const syncNode of syncOperations.pull)
        try {
            await syncUnmarshaller.unmarshall(syncNode)
            progress.incrementAndNotify();
        }
        catch (e) {
            errors = true;
            console.error(e);
        }

    await deleteNodes(syncOperations.delete);

    progress.finish();

    await nativeBackend.fetch("/sync/close_session");

    await settings.load();
    settings.last_sync_date(Date.now());

    if (errors)
        showNotification("Synchronization finished with errors.");
}

async function deleteSyncNodes(syncNodes) {
    if (syncNodes.length)
        await nativeBackend.post("/sync/delete", {nodes: JSON.stringify(syncNodes)});
}

async function deleteNodes(syncNodes) {
    for (const syncNode of syncNodes)
        try {
            if (syncNode.uuid === DEFAULT_SHELF_UUID)
                continue;
            const node = await Node.getByUUID(syncNode.uuid)
            await Node.delete(node.id)
        }
        catch (e) {
            console.error(e);
        }
}
