export default class UUID {
    static numeric() {
        let uuid = crypto.randomUUID();
        uuid = uuid.replaceAll(/-/g, "");
        return uuid.toUpperCase();
    }

    date() {
        const d = new Date();

        return d.getFullYear()
            + ("0" + (d.getMonth() + 1)).slice(-2)
            + ("0" + d.getDate()).slice(-2)
            + ("0" + d.getHours()).slice(-2)
            + ("0" + d.getMinutes()).slice(-2)
            + ("0" + d.getSeconds()).slice(-2);
    };
};
