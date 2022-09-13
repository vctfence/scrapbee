import {settings} from "../../settings.js";
import {setSaveCheckHandler, setSaveSelectHandler} from "../options.js";
import {selectricRefresh, simpleSelectric} from "../shelf_list.js";
import {send} from "../../proxy.js";

function configureScrapyardSettingsPage() {
    simpleSelectric("#option-sidebar-theme");
    simpleSelectric("#option-export-format");

    let dataFolderInputTimeout;
    $("#option-data-folder-path").on("input", e => {
        clearTimeout(dataFolderInputTimeout);
        dataFolderInputTimeout = setTimeout(async () => {
            await settings.load();

            const path = e.target.value
            await settings.data_folder_path(path);

            const status = await send.checkSyncDirectory({path});

            if (status)
                send.shelvesChanged();
        }, 1000)
    });

    $("#option-sidebar-theme").on("change", e => {
        localStorage.setItem("scrapyard-sidebar-theme", e.target.value);
        send.sidebarThemeChanged({theme: e.target.value});
    });

    let listHeightInputTimeout;
    $("#option-shelf-list-max-height").on("input", e => {
        clearTimeout(listHeightInputTimeout);
        listHeightInputTimeout = setTimeout(async () => {
            await settings.load();
            await settings.shelf_list_height(+e.target.value);
            send.reloadSidebar({height: +e.target.value});
        }, 1000)
    });

    $("#option-helper-port").on("input", async e => {
        await settings.load();
        settings.helper_port_number(+e.target.value);
    });

    setSaveSelectHandler("option-export-format", "export_format");

    setSaveCheckHandler("option-capitalize-builtin-shelf-names", "capitalize_builtin_shelf_names",
        () => send.shelvesChanged());
    setSaveCheckHandler("option-show-firefox-bookmarks", "show_firefox_bookmarks",
        () => send.reconcileBrowserBookmarkDb());
    setSaveCheckHandler("option-show-firefox-bookmarks-toolbar", "show_firefox_toolbar",
        () => send.externalNodesReady());
    setSaveCheckHandler("option-visually-emphasise-archives", "visually_emphasise_archives",
        () => send.shelvesChanged());
    setSaveCheckHandler("option-archives-icon", "visual_archive_icon",
        () => send.shelvesChanged());
    setSaveCheckHandler("option-archives-color", "visual_archive_color",
        () => send.shelvesChanged());
    setSaveCheckHandler("option-display-random-bookmark", "display_random_bookmark",
        e => send.displayRandomBookmark({display: e.target.checked}));
    setSaveCheckHandler("option-show-firefox-bookmarks-mobile", "show_firefox_mobile");
    setSaveCheckHandler("option-do-not-show-archive-toolbar", "do_not_show_archive_toolbar");
    setSaveCheckHandler("option-switch-to-bookmark", "switch_to_new_bookmark");
    setSaveCheckHandler("option-open-bookmark-in-active-tab", "open_bookmark_in_active_tab");
    setSaveCheckHandler("option-open-sidebar-from-shortcut", "open_sidebar_from_shortcut");
    setSaveCheckHandler("option-do-not-switch-to-ff-bookmark", "do_not_switch_to_ff_bookmark");
    setSaveCheckHandler("option-use-helper-app-for-export", "use_helper_app_for_export");
    setSaveCheckHandler("option-undo-failed-imports", "undo_failed_imports");
    setSaveCheckHandler("option-browse-with-helper", "browse_with_helper");
}

function loadScrapyardSettings() {
    $("#option-data-folder-path").val(settings.data_folder_path() || "");
    $("#option-sidebar-theme").val(localStorage.getItem("scrapyard-sidebar-theme") || "light");
    $("#option-shelf-list-max-height").val(settings.shelf_list_height());
    $("#option-show-firefox-bookmarks").prop("checked", settings.show_firefox_bookmarks());
    $("#option-show-firefox-bookmarks-toolbar").prop("checked", settings.show_firefox_toolbar());
    $("#option-visually-emphasise-archives").prop("checked", settings.visually_emphasise_archives());
    $("#option-archives-icon").prop("checked", settings.visual_archive_icon());
    $("#option-archives-color").prop("checked", settings.visual_archive_color());
    $("#option-show-firefox-bookmarks-mobile").prop("checked", settings.show_firefox_mobile());
    $("#option-switch-to-bookmark").prop("checked", settings.switch_to_new_bookmark());
    $("#option-do-not-show-archive-toolbar").prop("checked", settings.do_not_show_archive_toolbar());
    $("#option-do-not-switch-to-ff-bookmark").prop("checked", settings.do_not_switch_to_ff_bookmark());
    $("#option-display-random-bookmark").prop("checked", settings.display_random_bookmark());
    $("#option-open-bookmark-in-active-tab").prop("checked", settings.open_bookmark_in_active_tab());
    $("#option-open-sidebar-from-shortcut").prop("checked", settings.open_sidebar_from_shortcut());
    $("#option-capitalize-builtin-shelf-names").prop("checked", settings.capitalize_builtin_shelf_names());
    $("#option-export-format").val(settings.export_format());
    $("#option-use-helper-app-for-export").prop("checked", settings.use_helper_app_for_export());
    $("#option-undo-failed-imports").prop("checked", settings.undo_failed_imports());
    $("#option-browse-with-helper").prop("checked", settings.browse_with_helper());
    $("#option-helper-port").val(settings.helper_port_number());

    selectricRefresh($("#option-sidebar-theme"));
    selectricRefresh($("#option-export-format"));
}

export function load() {
    configureScrapyardSettingsPage();
    loadScrapyardSettings();
}
