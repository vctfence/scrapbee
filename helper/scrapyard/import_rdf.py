import json
import logging
import os
import shutil
import threading
import regex

from bs4 import BeautifulSoup

from .server import storage_manager


archive_import_mutex = threading.Lock()


def with_mutex(f):
    archive_import_mutex.acquire()
    try:
        f()
    finally:
        archive_import_mutex.release()


def import_rdf_archive(params):
    uuid = params["uuid"]
    scrapbook_id = params["scrapbook_id"]
    rdf_path = params["rdf_directory"]

    object_directory = storage_manager.get_object_directory(params, uuid)
    unpacked_archive_directory = storage_manager.get_archive_unpacked_path(object_directory)
    rdf_archive_directory = os.path.join(rdf_path, "data", scrapbook_id)

    result = dict()

    if os.path.exists(rdf_archive_directory):
        with_mutex(lambda: shutil.copytree(rdf_archive_directory, unpacked_archive_directory, dirs_exist_ok=True))
        words = build_archive_index(rdf_archive_directory)
        store_archive_index(params, words)
        result["archive_index"] = words

        read_rdf_metadata(rdf_archive_directory, result)
        if result.get("comments", None):
            store_archive_comments(params, result)

    return result


def import_rdf_archive_index(params):
    scrapbook_id = params["scrapbook_id"]
    rdf_path = params["rdf_directory"]
    rdf_archive_directory = os.path.join(rdf_path, "data", scrapbook_id)

    result = dict()

    if os.path.exists(rdf_archive_directory):
        words = build_archive_index(rdf_archive_directory)
        result["archive_index"] = words

    return result


def build_archive_index(path):
    words = []

    for file in os.listdir(path):
        if file.endswith(".html"):
            file_path = os.path.join(path, file)
            with open(file_path, "r", encoding="utf-8") as html_file:
                soup = BeautifulSoup(html_file, 'html.parser')

                for script in soup(["script", "style"]):
                    script.extract()

                text = soup.body.get_text(separator=' ')
                file_words = create_index(text)
                words += file_words

    return list(set(words))


def create_index(string):
    string = string.replace("\n", " ")
    string = regex.sub(r"(?:\p{Z}|[^\p{L}-])+", " ", string)
    words = string.split(" ")
    words = [w.lower() for w in words if len(w) > 2]
    return words


def read_rdf_metadata(rdf_archive_directory, result):
    metadata_file_path = os.path.join(rdf_archive_directory, "index.dat")

    if os.path.exists(metadata_file_path):
        with open(metadata_file_path, "r", encoding="utf-8") as metadata_file:
            lines = metadata_file.readlines()

            for line in lines:
                if line.startswith("chars"):
                    result["charset"] = line.replace("chars", "", 1).strip()

                if line.startswith("comment"):
                    comments = line.replace("comment", "", 1).strip()
                    comments = comments.replace(" __BR__ ", "\n")
                    create_index(comments)


def store_archive_comments(params, result):
    comments = {"content": result["comments"]}
    params["comments_json"] = json.dumps(comments, ensure_ascii=False, separators=(',', ':'))
    with_mutex(lambda: storage_manager.persist_comments(params))

    comments_index = {"content": result["comments_index"]}
    params["index_json"] = json.dumps(comments_index, ensure_ascii=False, separators=(',', ':'))
    with_mutex(lambda: storage_manager.persist_comments_index(params))


def store_archive_index(params, words):
    index = {"content": words}
    params["index_json"] = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    with_mutex(lambda: storage_manager.persist_archive_index(params))
