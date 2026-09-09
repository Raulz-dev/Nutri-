from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "environment": "test"}


def test_initial_routes_are_registered() -> None:
    paths = client.get("/openapi.json").json()["paths"]

    assert "/api/v1/users" in paths
    assert "/api/v1/users/me" in paths
    assert "/api/v1/users/{user_id}" in paths
    assert "/api/v1/auth/login" in paths
    assert "/api/v1/auth/refresh" in paths
    assert "/api/v1/auth/logout" in paths
    assert "/api/v1/auth/password/forgot" in paths
    assert "/api/v1/auth/password/reset" in paths

    user_collection = paths["/api/v1/users"]
    assert {"get", "post"} <= user_collection.keys()

    user_resource = paths["/api/v1/users/{user_id}"]
    assert {"get", "patch", "delete"} <= user_resource.keys()
