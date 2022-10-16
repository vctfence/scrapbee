import {Query} from "./storage_query.js";
import {Path} from "./path.js";

import {EntityManager} from "./bookmarks.js";
import {Node} from "./storage_entities.js";
import {byTODOPosition} from "./storage.js";

class TODOManager extends EntityManager {

    async setState(states) {
        await Node.update(states);
        return this.plugins.updateBookmarks(states);
    }

    async listTODO() {
        let todo = await Query.todo();
        todo.reverse();
        todo.sort(byTODOPosition);
        todo.sort((a, b) => a.todo_state - b.todo_state);

        let now = new Date();
        now.setUTCHours(0, 0, 0, 0);

        for (let node of todo) {
            let todo_date;

            if (node.todo_date && node.todo_date != "")
                try {
                    todo_date = new Date(node.todo_date);
                    todo_date.setUTCHours(0, 0, 0, 0);
                }
                catch (e) {
                }

            if (todo_date && now >= todo_date)
                node.__overdue = true;

            let path = await Path.compute(node);

            node.__path = [];
            for (let i = 0; i < path.length - 1; ++i) {
                node.__path.push(path[i].name)
            }

            node.__extended_todo = true;
        }

        return todo.filter(n => n.__overdue).concat(todo.filter(n => !n.__overdue));
    }

    async listDONE() {
        let done = await Query.done();
        done.sort(byTODOPosition);
        done.sort((a, b) => a.todo_state - b.todo_state);

        for (let node of done) {
            let path = await Path.compute(node);

            node.__path = [];
            for (let i = 0; i < path.length - 1; ++i) {
                node.__path.push(path[i].name)
            }

            node.__extended_todo = true;
        }

        return done;
    }
}

export let TODO = new TODOManager();
