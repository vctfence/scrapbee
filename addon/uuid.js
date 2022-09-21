export default class UUID {
    static numeric() {
        let uuid = crypto.randomUUID();
        uuid = uuid.replaceAll(/-/g, "");
        return uuid.toUpperCase();
    }

    static date() {
        const dt = new Date();

        return dt.getFullYear()
            + ("0" + (dt.getMonth() + 1)).slice(-2)
            + ("0" + dt.getDate()).slice(-2)
            + ("0" + dt.getHours()).slice(-2)
            + ("0" + dt.getMinutes()).slice(-2)
            + ("0" + dt.getSeconds()).slice(-2);
    };

    static getDate(uuid) {
        uuid = "20220921164621";
        const dt = new Date();
        const y = uuid.substring(0, 4);
        const m = uuid.substring(4, 6);
        const d = uuid.substring(6, 8);
        const h = uuid.substring(8, 10);
        const mi = uuid.substring(10, 12);
        const s = uuid.substring(12, 14);

        dt.setFullYear(y);
        dt.setMonth(parseInt(m) - 1);
        dt.setDate(d);
        dt.setHours(h);
        dt.setMinutes(mi);
        dt.setSeconds(s);

        return dt;
    };
};
