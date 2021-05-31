import {settings} from "../settings.js";
import {ShelfList} from "./shelf_list.js";
import {backend} from "../backend.js";
import {send} from "../proxy.js";
import {EVERYTHING, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "../storage.js";
import {getFavicon} from "../favicon.js";
import {fetchWithTimeout} from "../utils_io.js";

const DEFAULT_LINK_CHECK_TIMEOUT = 10;

export class LinkChecker {

    constructor() {
        $("#start-check-links").on("click", () => this.startCheckLinks());

        const linkCheckTimeoutInput = $("#link-check-timeout");
        linkCheckTimeoutInput.val(settings.link_check_timeout() || DEFAULT_LINK_CHECK_TIMEOUT)
        linkCheckTimeoutInput.on("input", async e => {
            await settings.load();
            let timeout = parseInt(e.target.value);
            settings.link_check_timeout(isNaN(timeout)? DEFAULT_LINK_CHECK_TIMEOUT: timeout);
        });

        this.shelfList = new ShelfList("#check-scope", {
            maxHeight: settings.shelf_list_height() || settings.default.shelf_list_height,
            _prefix: "checklinks"
        });

        this.shelfList.initDefault();
    }

    async load() {
        const urlParams = new URLSearchParams(window.location.search);
        this.autoStartCheckLinks = !!urlParams.get("menu");

        if (this.autoStartCheckLinks) {
            $("#update-icons").prop("checked", urlParams.get("repairIcons") === "true");
            let scopePath = await backend.computePath(parseInt(urlParams.get("scope")));
            $(".selectric-wrapper", $("#check-links"))
                .replaceWith(`<span style="white-space: nowrap">${scopePath.slice(-1)[0].name}&nbsp;&nbsp;</span>`);
            this.autoLinkCheckScope = scopePath.map(g => g.name).join("/");
            this.startCheckLinks();
        }
    }

    stopCheckLinks() {
        $("#start-check-links").val("Check");
        $("#current-link-title").text("");
        $("#current-link-url").text("");
        $("#current-link").css("visibility", "hidden");
        this.abortCheckLinks = false;

        if ($("#update-icons").is(":checked")) {
            setTimeout(() => send.nodesUpdated(), 500);
        }
    }

    async startCheckLinks() {
        const startCheckLinksButton = $("#start-check-links");
        const invalidLinksContainerDiv = $("#invalid-links-container");
        const invalidLinksDiv = $("#invalid-links");

        if (startCheckLinksButton.val() === "Check") {

            startCheckLinksButton.val("Stop");

            let updateIcons = $("#update-icons").is(":checked");
            let path;

            if (this.autoStartCheckLinks)
                path = this.autoLinkCheckScope;
            else {
                let scope = this.shelfList.selectedShelfName;
                path = scope === EVERYTHING ? undefined : scope;
            }

            $("#current-link").css("visibility", "visible");
            invalidLinksContainerDiv.hide();
            invalidLinksDiv.html("");

            async function updateIcon(node, html) {
                let favicon = await getFavicon(node.uri, html);

                if (favicon) {
                    node.icon = favicon;
                    await backend.storeIcon(node);
                }
                else if (node.icon && !node.stored_icon) {
                    node.icon = undefined;
                    await backend.updateNode(node);
                }
            }

            function displayLinkError(error, node) {
                invalidLinksContainerDiv.show();
                let invalidLink = `<a href="${node.uri}" target="_blank" class="invalid-link">${node.name}</a>`
                invalidLinksDiv.append(`<tr>
                                           <td>
                                               <img id="link-check-select-${node.id}" class="result-action-icon"
                                                    src="../icons/tree-select.svg" title="Select"/>
                                           </td>
                                           <td>
                                               <a href="http://web.archive.org/web/${encodeURIComponent(node.uri)}"
                                                  target="_blank"><img class="result-action-icon-last"
                                                                        src="../icons/web-archive.svg"
                                                                        title="Web Archive"/></a>
                                           </td>
                                           <td class="link-check-error">${error}</td>
                                           <td>${invalidLink}</td>
                                        </tr>`);
                $(`#link-check-select-${node.id}`).click(e => send.selectNode({node}));
            }

            const nodes = await backend.listNodes({path: path, types: [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK]});

            for (let node of nodes) {
                if (this.abortCheckLinks)
                    break;

                if (!node.uri)
                    continue;

                $("#current-link-title").text(node.name);
                $("#current-link-url").text(node.uri);

                let error;
                let networkError;
                let contentType;
                let response;

                try {
                    let timeout = parseInt($("#link-check-timeout").val());
                    timeout = isNaN(timeout)? DEFAULT_LINK_CHECK_TIMEOUT: timeout;
                    response = await fetchWithTimeout(node.uri, {timeout: timeout * 1000});

                    if (!response.ok)
                        error = `[HTTP Error: ${response.status}]`;
                    else
                        contentType = response.headers.get("content-type");
                }
                catch (e) {
                    networkError = true;

                    if (e.name === "AbortError")
                        error = `[Timeout]`;
                    else
                        error = "[Unavailable]"
                }

                if (error) {
                    displayLinkError(error, node);

                    if (networkError && updateIcons && node.icon && !node.stored_icon) {
                        node.icon = undefined;
                        await backend.updateNode(node);
                    }
                }
                else if (updateIcons && contentType?.toLowerCase()?.startsWith("text/html")) {
                    try {
                        await updateIcon(node, await response.text());
                    }
                    catch (e) {
                        console.error(e)
                    }
                }
            }

            this.stopCheckLinks();
        }
        else {
            this.stopCheckLinks();
            this.abortCheckLinks = true;
        }
    }
}
