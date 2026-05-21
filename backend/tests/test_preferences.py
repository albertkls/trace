from __future__ import annotations


def test_theme_preference_defaults_to_dark(client):
    response = client.get("/api/preferences/theme")
    assert response.status_code == 200
    assert response.json() == {"preference": "dark"}


def test_theme_preference_persists_in_settings(client):
    updated = client.put("/api/preferences/theme", json={"preference": "light"})
    assert updated.status_code == 200
    assert updated.json() == {"preference": "light"}

    response = client.get("/api/preferences/theme")
    assert response.status_code == 200
    assert response.json() == {"preference": "light"}


def test_theme_preference_rejects_invalid_value(client):
    response = client.put("/api/preferences/theme", json={"preference": "sepia"})
    assert response.status_code == 400
