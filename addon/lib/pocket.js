const ROOT_URL = 'https://getpocket.com';
const ADD_URL = '/v3/add';
const SEND_URL = '/v3/send';
const GET_URL = '/v3/get';
const OAUTH_REQUEST_URL = '/v3/oauth/request';
const OAUTH_TOKEN_URL = '/auth/authorize';
const OAUTH_ACCESS_URL = '/v3/oauth/authorize';

export class GetPocket {

    constructor({consumer_key, access_token, redirect_uri, auth_handler, persist_token}) {
        this.consumer_key = consumer_key;
        this.access_token = access_token;
        this.redirect_uri = redirect_uri;
        this.auth_handler = auth_handler;
        this.persist_token = persist_token;

        this.headers = {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Accept': 'application/json'
        };
    }

    async postJSON(url, options, authorize = true) {
        try {
            if (authorize && !this.access_token)
                options.access_token = await this.authorize(this.redirect_uri, this.auth_handler, this.persist_token);

            let fetchf = reentry => fetch(url, {method: "post", headers: this.headers, body: JSON.stringify(options)})
                .then(async response => {
                    if (response.ok)
                        return response.json();
                    else if (!reentry && response.status >= 400) { // Forbidden, etc.
                        if (authorize)
                            options.access_token =
                                await this.authorize(this.redirect_uri, this.auth_handler, this.persist_token);
                        return fetchf(true);
                    }
                    else
                        return Promise.reject(new Error(`${response.status}: ${response.statusText}`));
                });

            return fetchf();
        }
        catch (e) {
            return Promise.reject(e);
        }
    }

    getRequestToken(redirect_uri) {
        let options = {};
        let url = ROOT_URL + OAUTH_REQUEST_URL;

        this.redirect_uri = redirect_uri;
        options.consumer_key = this.consumer_key;
        options.redirect_uri = this.redirect_uri;

        return this.postJSON(url, options, false).then(json => (this.request_token = json.code, json));
    }

    getAuthURL() {
        return ROOT_URL + OAUTH_TOKEN_URL + '?request_token=' + this.request_token
                        + '&redirect_uri=' + this.redirect_uri;
    }

    getAccessToken() {
        let options = {};
        let url = ROOT_URL + OAUTH_ACCESS_URL;

        options.consumer_key = this.consumer_key;
        options.code = this.request_token;

        return this.postJSON(url, options, false).then(json => (this.access_token = json.access_token, json));
    }

    authorize(redirect_uri, handle_auth, persist_token) {
        return this.getRequestToken(redirect_uri)
            .then(() => handle_auth(this.getAuthURL())
                .then(() => this.getAccessToken()
                    .then(json => (persist_token(json.access_token), json.access_token))));
    }

    // add(url) {
    //     let options = {};
    //     let url = ROOT_URL + ADD_URL;
    //
    //     options.consumer_key = this.consumer_key;
    //     options.access_token = this.access_token;
    //
    //     return this.postJSON(url, options);
    // }

    send(actions) {
        let options = {};
        let url = ROOT_URL + SEND_URL;

        options.actions = actions;
        options.consumer_key = this.consumer_key;
        options.access_token = this.access_token;

        return this.postJSON(url, options);
    }

    modify (params) {
        // alias for send
        return this.send(params);
    }

    // get: function(params, callback) {
    //     if (!params.url)
    //         return Promise.reject(new Error('400 Bad Request - missing params.url'));
    //
    //     let options = params;
    //     let url = ROOT_URL + GET_URL;
    //
    //     options.consumer_key = this.config.consumer_key;
    //     options.access_token = this.config.access_token;
    //
    //     return this.postJSON(url, options);
    // },
    //
    // retrieve: function(params, callback) {
    //     // alias for get
    //     return this.get(params, callback);
    // },
    //
    // archive: function(params) {
    //     let isSingleItem = !Array.isArray(params);
    //     if (!params || (isSingleItem && !params.item_id))
    //         return Promise.reject(new Error('400 Bad Request - missing params.item_id'));
    //
    //     if (isSingleItem) params = [params];
    //
    //     let timestamp = new Date().getTime();
    //     let actions = params.map(function (item) {
    //         if (item.item_id) {
    //             return {
    //                 action: 'archive',
    //                 item_id: item.item_id,
    //                 time: timestamp
    //             }
    //         }
    //     });
    //
    //     if (params.length !== actions.length)
    //         return Promise.reject(new Error('400 Bad Request - missing some params.item_id'));
    //
    //     let options = {
    //         actions: actions
    //     };
    //     this.send(options);
    // },
    //
    // delete: function(params, callback) {
    //     let isSingleItem = !Array.isArray(params);
    //     if (!params || (isSingleItem && !params.item_id))
    //         return Promise.reject(new Error('400 Bad Request - missing params.item_id'));
    //
    //     if (isSingleItem) params = [params];
    //
    //     let timestamp = new Date().getTime();
    //     let actions = params.map(function (item) {
    //         if (item.item_id) {
    //             return {
    //                 action: 'delete',
    //                 item_id: item.item_id,
    //                 time: timestamp
    //             }
    //         }
    //     });
    //     if (params.length !== actions.length)
    //         return Promise.reject(new Error('400 Bad Request - missing some params.item_id'));
    //
    //     let options = {
    //         actions: actions
    //     };
    //     this.send(options);
    // },
}
