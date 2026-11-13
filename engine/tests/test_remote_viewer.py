"""휴대폰(안드로이드) 보기 앱처럼 '다른 출처 + 다른 기기 주소'에서 PC 엔진에 접속하는 길.

1.1.0 안드로이드 앱은 사전 확인(OPTIONS)이 401로 막혀 PC를 찾지 못했다. 그 길과,
'백업 → 앱 삭제·새로 설치(연결 표 잃음) → 다시 연결 → 복원'이 되는지 시험한다.
"""

import time

import pytest
from fastapi.testclient import TestClient

APP_ORIGIN = "http://localhost"  # 안드로이드 포장 앱(Capacitor)의 화면 주소


def _remote(app, ip="192.168.0.50"):
    """요청이 같은 와이파이의 다른 기기(휴대폰)에서 온 것처럼 바꾼다."""

    async def wrapped(scope, receive, send):
        if scope["type"] in ("http", "websocket"):
            scope = {**scope, "client": (ip, 50000)}
        await app(scope, receive, send)

    return wrapped


@pytest.fixture()
def phone(home):
    from hdbiseo import server
    from hdbiseo import settings as st

    server.register_extras()
    st.save_app_config({"lan_enabled": True, "pair_code": "123456", "tokens": []})
    return TestClient(_remote(server.app), headers={"Origin": APP_ORIGIN})


@pytest.fixture()
def pc(home):
    from hdbiseo import server

    server.register_extras()
    return TestClient(server.app)


def _pair(phone) -> str:
    r = phone.post("/api/pair", json={"code": "123456"})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_preflight_is_allowed_before_and_after_pairing(phone):
    pre = {"Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "x-hd-user,x-hd-token"}
    r = phone.options("/api/settings", headers=pre)
    assert r.status_code == 200, r.text
    assert r.headers.get("access-control-allow-origin") == APP_ORIGIN
    _pair(phone)
    r = phone.options("/api/settings", headers=pre)
    assert r.status_code == 200 and r.headers.get("access-control-allow-origin") == APP_ORIGIN


def test_unpaired_request_gets_readable_need_pair(phone):
    r = phone.get("/api/settings")
    assert r.status_code == 401
    assert r.json().get("need_pair") is True
    # 허용 머리말이 있어야 앱이 '연결 번호 입력' 창을 띄울 수 있다
    assert r.headers.get("access-control-allow-origin") == APP_ORIGIN


def test_token_in_header_and_in_query(phone):
    tok = _pair(phone)
    assert phone.get("/api/settings", headers={"x-hd-token": tok}).status_code == 200
    # 사진·영상 주소(<img>)는 머리말을 못 보내므로 주소 뒤 hd_token으로 받는다
    phone.cookies.clear()
    assert phone.get("/api/settings", params={"hd_token": tok}).status_code == 200
    assert phone.get("/api/settings", params={"hd_token": "엉터리"}).status_code == 401


def test_other_origins_are_not_allowed(home):
    from hdbiseo import server
    from hdbiseo import settings as st

    server.register_extras()
    st.save_app_config({"lan_enabled": True, "pair_code": "123456", "tokens": []})
    evil = TestClient(_remote(server.app), headers={"Origin": "http://evil.example"})
    r = evil.options("/api/settings", headers={"Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in r.headers
    assert "access-control-allow-origin" not in evil.get("/api/settings").headers


def test_backup_then_fresh_install_then_restore(phone, pc, sample_dir):
    """휴대폰 앱을 지우고 새로 깔아도 PC의 자료는 그대로이고, 휴대폰에서 만든 백업으로 되살릴 수 있다."""
    assert pc.post("/api/roots", json={"path": str(sample_dir)}).status_code == 200
    pc.post("/api/index/start", json={})
    for _ in range(300):
        s = pc.get("/api/index/status").json()
        if not s["running"] and s["state"]["phase"] == "done":
            break
        time.sleep(0.2)
    total = pc.get("/api/index/status").json()["overview"]["total"]
    assert total > 20

    # ① 업데이트 전: 휴대폰 앱에서 '지금 백업' → 백업 파일은 PC에 저장된다(휴대폰 앱 밖)
    old = _pair(phone)
    h_old = {"x-hd-token": old}
    r = phone.post("/api/backup", json={}, headers=h_old)
    assert r.status_code == 200 and r.json()["file"].endswith(".db")
    saved = r.json()["file"]
    from hdbiseo import core

    assert (core.get_engine("default").dir / "backups" / saved).exists()

    # ② 앱 삭제 + 새 앱 설치: 휴대폰에 있던 연결 표·쿠키가 모두 사라진다
    fresh = phone
    fresh.cookies.clear()
    r = fresh.get("/api/settings")
    assert r.status_code == 401 and r.json()["need_pair"]

    # ③ 새 앱에서 연결 번호를 다시 넣으면 PC의 자료가 그대로 보인다
    new = _pair(fresh)
    h_new = {"x-hd-token": new}
    assert fresh.get("/api/index/status", headers=h_new).json()["overview"]["total"] == total

    # ④ 백업에서 복원: 휴대폰에서도 백업 목록이 보이고 되살릴 수 있다
    files = [b["file"] for b in fresh.get("/api/backups", headers=h_new).json()]
    assert saved in files
    r = fresh.post("/api/restore", json={"file": saved}, headers=h_new)
    assert r.status_code == 200, r.text
    assert fresh.get("/api/index/status", headers=h_new).json()["overview"]["total"] == total
