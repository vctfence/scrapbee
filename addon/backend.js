
class Backend {
    constructor(host, credentials) {
        this._host = host;
        this._user = credentials;
    }

    httpGet(path, success, error) {
        $.ajax(this._host + path, {
            dataType: "json",
            headers: {"X-Scrapyard-Auth": this._user},
            success: success,
            error: error
        });
    }

    httpPost(path, data, success, error) {
        $.ajax(this._host + path, {
            data: JSON.stringify(data),
            dataType: "json",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Scrapyard-Auth": this._user
            },
            success: success,
            error: error
        });
    }

}


export {Backend};
