import {settings} from "./settings.js";

export function delegateProxy (target, origin) {
    return new Proxy(target, {
        get (target, key, receiver) {
            if (key in target) return Reflect.get(target, key, receiver)
            const value = origin[key]
            return 'function' === typeof value ? function method () {
                return value.apply(origin, arguments)
            } : value
        },
        set (target, key, value, receiver) {
            if (key in target) return Reflect.set(target, key, value, receiver)
            origin[key] = value
            return true
        }
    })
}


function makeMessageName(name) {
    return name.replace(/([a-z0-9]|(?=[A-Z]))([A-Z])/g, '$1_$2').toUpperCase();
}

class ReceiveHandler {
    constructor() {
        this.methods = new Map();
        this.listener = null;
    }

    set(target, key, value, receiver) {
        const type = makeMessageName(key);
        this.methods.set(type, value);
        return true;
    }

    get(target, key, receiver) {
        if (key === "startListener") {
            return isAsync => {
                if (!this.listener) {
                    this.listener =
                        isAsync
                            ? async (...args) => this._dispatch.apply(this, args)
                            : (...args) => this._dispatch.apply(this, args);
                    target._handler.addListener(this.listener);
                }
            };
        }
        else if (key === "methods") {
            return this.methods;
        }
    }

    _dispatch() {
        const [message] = arguments;

        const method = this.methods.get(message.type);
        if (method)
            return Reflect.apply(method, null, arguments);
        else
            if (DEBUG)
                console.error(`No method for message type: ${message.type}`);
    }
}

export let receive = new Proxy({_handler: browser.runtime.onMessage}, new ReceiveHandler());
export let receiveExternal = new Proxy({_handler: browser.runtime.onMessageExternal}, new ReceiveHandler());


export let send = new Proxy({}, {
    get(target, key, receiver) {
        const type = makeMessageName(key);

        return (val) => {
            const payload = val || {};
            //console.log(payload)
            //console.trace()
            payload.type = type;
            return browser.runtime.sendMessage(payload);
        };
    }
});

export let sendLocal = new Proxy({_receiver: receive}, {
    get(target, key, receiver) {
        const type = makeMessageName(key);

        return (val) => {
            const payload = val || {};
            payload.type = type;

            if (target._receiver.methods.has(type)) {
                const method = target._receiver.methods.get(type);
                return method.apply(null, [payload]);
            }
            else
                return browser.runtime.sendMessage(payload);
        };
    }
});

