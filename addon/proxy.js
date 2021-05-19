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
            //console.log(payload)
            return browser.runtime.sendMessage(payload);
        };
    }
});

export let receive = new Proxy(() => {}, {
    methods: new Map(),

    set(target, key, value, receiver) {
        const type = makeMessageName(key);
        receiver.methods.set(type, value);
        console.log(value)
        console.log(target)
        console.log(receiver)
        return true;
    },

    apply(target, thisArg, argumentsList) {
        console.log(thisArg);
        console.log(target);
        console.log(argumentsList);
        // const [message, sender] = argumentsList;
        //
        // const method = target[message.type];
        // console.log(message.type)
        // if (method)
        //     Reflect.apply(method, thisArg, argumentsList);
        // else
        //     console.error(`No method for message type: ${message.type}`);
    }
});
