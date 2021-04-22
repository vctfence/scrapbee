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


export let send = new Proxy({}, {
    get(target, key, receiver) {
        const type = makeMessageName(key);

        return (val) => {
            const payload = val || {};
            payload.type = type;
            return browser.runtime.sendMessage(payload);
        };
    }
})
