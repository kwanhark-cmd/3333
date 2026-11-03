"""윈도우 설치 프로그램(PyInstaller)의 시작 파일."""

import sys

from hdbiseo.server import run

if __name__ == "__main__":
    run(open_browser="--no-browser" not in sys.argv)
