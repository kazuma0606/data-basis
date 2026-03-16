from fastapi.testclient import TestClient


def _login(client: TestClient, username: str, password: str) -> str:
    resp = client.post("/auth/login", json={"username": username, "password": password})
    assert resp.status_code == 200
    return resp.json()["access_token"]


# ── POST /auth/login ───────────────────────────────────────
def test_login_success(client: TestClient) -> None:
    resp = client.post("/auth/login", json={"username": "admin", "password": "admin123"})
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client: TestClient) -> None:
    resp = client.post("/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_login_unknown_user(client: TestClient) -> None:
    resp = client.post("/auth/login", json={"username": "nobody", "password": "pass"})
    assert resp.status_code == 401


# ── GET /auth/me ──────────────────────────────────────────
def test_get_me_engineer(client: TestClient) -> None:
    token = _login(client, "engineer", "engineer123")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["username"] == "engineer"
    assert data["role"] == "engineer"
    assert data["store_id"] is None


def test_get_me_store_manager(client: TestClient) -> None:
    token = _login(client, "store_manager", "manager123")
    resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "store_manager"
    assert data["store_id"] == 1


def test_get_me_no_token(client: TestClient) -> None:
    resp = client.get("/auth/me")
    assert resp.status_code == 401


def test_get_me_invalid_token(client: TestClient) -> None:
    resp = client.get("/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert resp.status_code == 401


# ── POST /auth/logout ─────────────────────────────────────
def test_logout_success(client: TestClient) -> None:
    token = _login(client, "admin", "admin123")
    resp = client.post("/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_logout_no_token(client: TestClient) -> None:
    resp = client.post("/auth/logout")
    assert resp.status_code == 401
