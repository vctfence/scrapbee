import db
import config
import api
import imports


import argparse
import os, sys, shutil


def run_locally():
    for p in [config.SCRAPYARD_PATH, config.SCRAPYARD_DATA_PATH]:
        if not os.path.exists(p):
            os.makedirs(p)

    if not os.path.exists(config.SCRAPYARD_INDEX_PATH):
        shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), "scrapyard.sqlite"),
                    config.SCRAPYARD_INDEX_PATH)

    api.start()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['run_locally', 'import', 'user_add', 'user_reset', 'user_delete'])
    parser.add_argument('--file')
    parser.add_argument('--user')
    args = parser.parse_args()

    if args.action == 'run_locally':
        run_locally()
    else:
        if args.action == "import":
            if not args.file:
                print("No file specified.")
                sys.exit(-1)

            user = args.user
            file, ext = os.path.splitext(os.path.basename(args.file))

            if ".org" == ext:
                with open(args.file, 'r', encoding="utf-8") as org:
                    imports.import_org(args.user, file, org.read())

