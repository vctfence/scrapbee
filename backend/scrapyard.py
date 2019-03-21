import os, shutil

import db
import config
import api


if __name__ == "__main__":
    for p in [config.SCRAPYARD_PATH, config.SCRAPYARD_DATA_PATH]:
        if not os.path.exists(p):
            os.makedirs(p)

    if not os.path.exists(config.SCRAPYARD_INDEX_PATH):
        shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrapyard.sqlite"),
                    config.SCRAPYARD_INDEX_PATH)

    api.start()
