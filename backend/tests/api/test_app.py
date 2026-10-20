from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "environment": "test"}
    assert response.headers["x-request-id"]
    assert response.headers["cache-control"] == "no-store"


def test_validation_error_does_not_echo_sensitive_body() -> None:
    response = client.post(
        "/api/v1/auth/login", json={"email": "invalid", "password": "secret-example"}
    )
    assert response.status_code == 422
    assert "secret-example" not in response.text
    assert response.json()["error"]["request_id"] == response.headers["x-request-id"]


def test_metrics_requires_secret() -> None:
    assert client.get("/metrics").status_code == 404


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


def test_request_body_is_bounded():
    response = client.post("/api/v1/auth/login", content=b"x" * (1048576 + 1))
    assert response.status_code == 413
    assert "x" * 100 not in response.text


def test_clinical_message_schema_keeps_public_reference():
    schema = client.get("/openapi.json").json()
    reference = "#/components/schemas/app__care__interaction_router__MessageResponse"
    response = schema["paths"]["/api/v1/conversations/{assignment_id}/messages"]["post"]
    assert response["responses"]["201"]["content"]["application/json"]["schema"] == {
        "$ref": reference
    }
    schemas = schema["components"]["schemas"]
    assert schemas["MessagePage"]["properties"]["items"]["items"] == {"$ref": reference}
    assert "assignment_id" in schemas[reference.rsplit("/", 1)[-1]]["properties"]
