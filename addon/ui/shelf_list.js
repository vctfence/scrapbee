import {settings} from "../settings.js";
import {
    CLOUD_SHELF_ID,
    CLOUD_SHELF_NAME,
    CLOUD_SHELF_UUID,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    DONE_SHELF_ID,
    DONE_SHELF_NAME,
    EVERYTHING,
    EVERYTHING_SHELF_ID,
    FIREFOX_SHELF_ID,
    FIREFOX_SHELF_NAME,
    FIREFOX_SHELF_UUID,
    isSpecialShelf,
    TODO_SHELF_ID,
    TODO_SHELF_NAME
} from "../storage_constants.js";
import {backend, formatShelfName} from "../backend.js";

const WIDTH_INCREMENT = 5;

export class ShelfList {
    constructor(select, options) {
        options = options || {};
        options.inheritOriginalWidth = true;
        this._select = $(select).selectric(options);
    }

    _refresh() {
        this._select.selectric('refresh');
        let wrapper = this._select.closest(".selectric-wrapper");
        wrapper.width(wrapper.width() + WIDTH_INCREMENT);
    }

    _styleBuiltinShelf() {
        let {name} = this.getCurrentShelf();

        const label = $("span.label", this._select.closest(".selectric-wrapper"));

        if (isSpecialShelf(name))
            label.addClass("option-builtin");
        else
            label.removeClass("option-builtin");
    }

    getCurrentShelf() {
        let selectedOption = $(`option[value='${this._select.val()}']`, this._select);
        return {
            id: parseInt(selectedOption.val()),
            name: selectedOption.text(),
            uuid: selectedOption.attr("data-uuid"),
            option: selectedOption
        };
    }

    async reload() {
        this._select.html(`
    <option class="option-builtin" value="${TODO_SHELF_ID}" data-uuid="${TODO_SHELF_NAME}">${TODO_SHELF_NAME}</option>
    <option class="option-builtin" value="${DONE_SHELF_ID}" data-uuid="${DONE_SHELF_NAME}">${DONE_SHELF_NAME}</option>
    <option class="option-builtin divide" value="${EVERYTHING_SHELF_ID}"
            data-uuid="${EVERYTHING}">${formatShelfName(EVERYTHING)}</option>`);

        if (settings.cloud_enabled())
            this._select.append(`<option class=\"option-builtin\" data-uuid="${CLOUD_SHELF_UUID}"
                                         value=\"${CLOUD_SHELF_ID}\">${formatShelfName(CLOUD_SHELF_NAME)}</option>`);

        let shelves = await backend.listShelves();

        let cloudShelf = shelves.find(s => s.id === CLOUD_SHELF_ID);
        if (cloudShelf)
            shelves.splice(shelves.indexOf(cloudShelf), 1);

        if (settings.show_firefox_bookmarks())
            this._select.append(`<option class=\"option-builtin\" data-uuid="${FIREFOX_SHELF_UUID}"
                                         value=\"${FIREFOX_SHELF_ID}\">${formatShelfName(FIREFOX_SHELF_NAME)}</option>`);

        let firefoxShelf = shelves.find(s => s.id === FIREFOX_SHELF_ID);
        if (firefoxShelf)
            shelves.splice(shelves.indexOf(firefoxShelf), 1);

        shelves.sort((a, b) => a.name.localeCompare(b.name));

        let defaultShelf = shelves.find(s => s.name.toLowerCase() === DEFAULT_SHELF_NAME);
        shelves.splice(shelves.indexOf(defaultShelf), 1);
        defaultShelf.name = formatShelfName(defaultShelf.name);
        shelves = [defaultShelf, ...shelves];

        for (let shelf of shelves) {
            let option = $("<option></option>").appendTo(this._select).html(shelf.name)
                .attr("value", shelf.id)
                .attr("data-uuid", shelf.uuid);

            if (shelf.name.toLowerCase() === DEFAULT_SHELF_NAME)
                option.addClass("option-builtin");
        }
    }

    load() {
        return this.reload();
    }

    initDefault() {
        setTimeout(async () => {
            await this.load();
            this.selectShelf(EVERYTHING_SHELF_ID);
            this.change(() => null);
        });
    }

    hasShelf(name) {
        name = name.toLocaleLowerCase();
        let existingOption = $(`option`, this._select).filter(function(i, e) {
            return e.textContent.toLocaleLowerCase() === name;
        });

        return !!existingOption.length;
    }

    selectShelf(id) {
        const option = $(`option[value="${id}"]`, this._select);
        id = option.length? id: DEFAULT_SHELF_ID;

        this._select.val(id);
        this._styleBuiltinShelf();
        this._refresh();
    }

    get selectedShelfId() {
        return parseInt(this._select.val());
    }

    get selectedShelfName() {
        let selectedOption = $(`option[value='${this._select.val()}']`, this._select);
        return selectedOption.text();
    }

    change(handler) {
        const wrapper = (...args) => {
            this._styleBuiltinShelf();
            handler.apply(this._select[0], args);
        }
        this._select.change(wrapper);
    }

    removeShelves(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        for (const id of ids)
            $(`option[value="${id}"]`, this._select).remove();

        this._refresh();
    }

    renameShelf(id, name) {
        $(`option[value="${id}"]`, this._select).text(name);
        this._refresh();
    }
}


