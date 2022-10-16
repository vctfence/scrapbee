// TODO: has a known issue with multiple login attempts: state string from storage and url differ, currently unresolved
// to reproduce log out from OneDrive and try to log in again; some wait time (probably lifetime of a refresh token) helps
// to login successfully

import {CloudClientBase, CloudError, CloudItemNotFoundError} from "./cloud_client_base.js";
import {PKCE} from "./lib/PKCE.js";
import {settings} from "./settings.js";
import {send} from "./proxy.js";

const GRAPH_API_ENDPOINT = "https://graph.microsoft.com/v1.0";

export class OneDriveClient extends CloudClientBase {
    constructor() {
        super()
        this.ID = "onedrive"
        this._pkce = new PKCE({
            client_id: "c4d0a237-f00c-41a4-ac9f-f7aa4d88e857",
            redirect_uri: 'https://gchristensen.github.io/scrapyard',
            authorization_endpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
            token_endpoint: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
            requested_scopes: 'offline_access User.Read Files.ReadWrite Files.ReadWrite.AppFolder',
        });
    }

    initialize() {
        let refreshToken = settings.onedrive_refresh_token();
        if (refreshToken) {
            this._refreshToken = refreshToken;
        }
        else {
            browser.runtime.onMessage.addListener((request) => {
                if (request.type === "onedriveAuthenticated") {
                    this._refreshToken = request.refreshToken;
                }
            });
        }
    }

    isAuthenticated() {
        return !!settings.onedrive_refresh_token();
    }

    signOut() {
        settings.onedrive_refresh_token(null);
    }

    _getAuthorizationUrl() {
        return this._pkce.getAuthorizationUrl();
    }

    async _applyTokens(response) {
        if (response.access_token) {
            this._refreshToken = response.refresh_token;
            this._accessToken = response.access_token;
            this._accessTokenExpires = Date.now() + response.expires_in * 1000;

            await settings.onedrive_refresh_token(this._refreshToken);
        }
        else if (response.error?.code) { // MS Graph error on refresh token
            this._refreshToken = null;
            this._accessToken = null;

            await settings.onedrive_refresh_token(null);
        }
    }

    async _obtainRefreshToken(url) {
        const response = await this._pkce.exchangeForAccessToken(url);
        await this._applyTokens(response);
        send.onedriveAuthenticated({refreshToken: this._refreshToken});
    }

    async _refreshAccessToken() {
        const response = await this._pkce.refreshAccessToken(this._refreshToken);
        await this._applyTokens(response);
    }

    _injectToken(params) {
        if (!this._accessToken)
            throw new CloudError("OneDrive is not authorized.");

        params = params || {};
        params.headers = params.headers || {}
        params.headers["Authorization"] = `Bearer ${this._accessToken}`;
        return params;
    }

    async _makeGraphRequest(path, params) {
        params = this._injectToken(params);
        const response = await fetch(`${GRAPH_API_ENDPOINT}/${path}`, params);
        if (response.ok)
            return response;
        else
            throw await response.json();
    }

    async _makeRequest(path, params) {
        if (this._accessToken && this._accessTokenExpires - 5000 > Date.now()) {
            try {
                return this._makeGraphRequest(path, params);
            }
            catch (e) {
                if (e.error?.code === "InvalidAuthenticationToken") {
                    await this._refreshAccessToken();
                    return this._makeGraphRequest(path, params);
                }
                else
                    throw e;
            }
        }
        else {
            await this._refreshAccessToken();
            return this._makeGraphRequest(path, params);
        }
    }

    async _makeTextRequest(path, params) {
        const response = await this._makeRequest(path, params);
        return response.text();
    }

    async _makeBinaryRequest(path, params) {
        const response = await this._makeRequest(path, params);
        return response.arrayBuffer();
    }

    async _makeJSONRequest(path, params) {
        const response = await this._makeRequest(path, params);
        return response.json();
    }

    _getDrivePath(path) {
        return `/me/drive/special/approot:${path}`;
    }

    _uploadSmallFile(path, bytes) {
        const headers = {"Content-Type": "text/plain"};
        return this._makeRequest(path + ":/content", {method: "put", body: bytes, headers});
    }

    async _uploadLargeFile(path, bytes, mode = "replace") {
        const sessionParams = {
            item: {
                "@microsoft.graph.conflictBehavior": mode
            }
        };

        const sessionPath = path + ":/createUploadSession";
        const session = await this._makeJSONRequest(sessionPath, {
            method: "post",
            body: JSON.stringify(sessionParams),
            headers: {"Content-Type": "application/json"}
        });

        const CHUNK_SIZE = 60 * 320 * 1024;
        let fullChunks = Math.floor(bytes.byteLength / CHUNK_SIZE);

        for (let i = 0; i < fullChunks; ++i) {
            const start = i * CHUNK_SIZE;
            const end = start + CHUNK_SIZE;
            const chunk = bytes.slice(start, end);

            await this._sendSessionBytes(session.uploadUrl, chunk, start, end - 1, bytes.byteLength);
        }

        const remained = bytes.byteLength - fullChunks * CHUNK_SIZE;
        if (remained > 0) {
            const start = fullChunks * CHUNK_SIZE;
            const end = bytes.byteLength;
            const chunk = bytes.slice(start, end);

            await this._sendSessionBytes(session.uploadUrl, chunk, start, end - 1, bytes.byteLength);
        }
    }

    async _sendSessionBytes(url, bytes, start, end, size) {
        const headers = {
            "Content-Length": `${bytes.byteLength}`,
            "Content-Range": `bytes ${start}-${end}/${size}`
        };
        return fetch(url, {method: "put", body: bytes, headers});
    }

    async uploadFile(path, data) {
        const requestPath = this._getDrivePath(path);
        let bytes = data;

        if (typeof data === "string") {
            const encoder = new TextEncoder();
            bytes = encoder.encode(data);
        }

        if (bytes.byteLength < 4 * 1024 * 1024)
            return this._uploadSmallFile(requestPath, bytes)
        else
            return this._uploadLargeFile(requestPath, bytes);
    }

    async downloadFile(path, binary) {
        const requestPath = this._getDrivePath(path) + ":/content";
        try {
            if (binary)
                return await this._makeBinaryRequest(requestPath);
            else
                return await this._makeTextRequest(requestPath);
        }
        catch (e) {
            if (e instanceof CloudError)
                throw e;
            else if (e.error?.code === "itemNotFound")
                throw new CloudItemNotFoundError();

            console.error(e)
        }
    }

    async deleteFile(path) {
        const requestPath = this._getDrivePath(path)
        return this._makeRequest(requestPath, {method: "delete"});
    }

    async share(path, filename, content) {
        await this.authenticate();

        let bytes = content;
        if (content instanceof Blob)
            bytes = await content.arrayBuffer();
        else if (typeof content === "string") {
            const encoder = new TextEncoder();
            bytes = encoder.encode(content);
        }

        if (path === "/")
            path = "";

        filename = this._replaceSpecialChars(filename);
        const requestPath = this._getDrivePath(`${path}/${filename}`);
        return this._uploadLargeFile(requestPath, bytes, "rename");
    };

    async reset() {
        try {
            // TODO: add suport for @odata.nextLink
            const requestPath = this._getDrivePath(CloudClientBase.CLOUD_SHELF_PATH) + ":/children";
            const driveItems = await this._makeJSONRequest(requestPath);

            for (let item of driveItems.value) {
                const path = `${CloudClientBase.CLOUD_SHELF_PATH}/${item.name}`;
                await this.deleteFile(path);
            }
        }
        catch (e) {
            console.error(e);
        }
    }

    async getLastModified() {
        const requestPath =
            this._getDrivePath(`${CloudClientBase.CLOUD_SHELF_PATH}/${CloudClientBase.CLOUD_SHELF_INDEX}`);

        try {
            const driveItem = await this._makeJSONRequest(requestPath);
            return new Date(driveItem.lastModifiedDateTime);
        }
        catch (e) {
            console.error(e);
        }

        return null;
    }
}


export let oneDriveClient = new OneDriveClient();
