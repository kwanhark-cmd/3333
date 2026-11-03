"""얼굴·장면 인식(3단계에서 채움). 모델 파일이 있을 때만 켜진다."""

from __future__ import annotations


class Recognizer:
    def __init__(self, engine):
        self.engine = engine

    def phases(self) -> list:
        return []

    def status(self) -> dict:
        return {"faces": False, "scenes": False}
