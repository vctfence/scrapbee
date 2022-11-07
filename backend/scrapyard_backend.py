import multiprocessing

from scrapyard import backend

if __name__ == "__main__":
    multiprocessing.freeze_support()
    backend.main()

