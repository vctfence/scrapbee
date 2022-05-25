function configureDiagnosticsPage() {
    $("a.settings-menu-item[href='#diagnostics']").show();

    function isIDBWriteError(error) {
        return error.name === "OpenFailedError" && error.message
            && error.message.includes("A mutation operation was attempted on a "
                + "database that did not allow mutations");
    }

    function formatIDBWriteError() {
        const errorDescriptionPre = $("#diagnostics-error-info");
        const parent = errorDescriptionPre.parent();
        errorDescriptionPre.remove();
        $("#diagnostics-guide").remove();

        $("<p>Scrapyard can not open its database for writing. "
            + "This may be a consequence of particular combination of browser and system settings or an interference with "
            + "Firefox profile files, for example, by an antivirus as it is explained on the addon "
            + "<a href='https://addons.mozilla.org/en-US/firefox/addon/scrapyard/'>page</a></p>.")
            .appendTo(parent);
    }

    function formatGenericError(error) {
        $("#diagnostics-error-info").text(
            `Error name: ${error.name}\n`
            + `Error message: ${error.message}\n`
            + `Origin: ${error.origin}\n`
            + `Browser version: ${navigator.userAgent}\n\n`
            + `Stacktrace\n\n`
            + `${error.stack}`);
    }

    let error = localStorage.getItem("scrapyard-diagnostics-error");
    if (error) {
        error = JSON.parse(error);

        if (isIDBWriteError(error))
            formatIDBWriteError();
        else
            formatGenericError(error);

        localStorage.removeItem("scrapyard-diagnostics-error");
    }
    else {
        $("#diagnostics-error-info").text("No errors detected.");
    }
}

export function load() {
    configureDiagnosticsPage();
}
