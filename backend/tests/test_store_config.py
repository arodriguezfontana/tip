CONFIG_URL = "/api/v1/store-config"


def test_public_get_store_config_returns_default(public_client):
    response = public_client.get(CONFIG_URL)
    assert response.status_code == 200
    data = response.json()
    assert data["store_name"] == "RestoIT"
    assert data["theme_color"] == "black"
    assert "address" in data
    assert "opening_hours" in data
    assert "contact_phone" in data


def test_modify_store_config_requires_admin(public_client):
    payload = {
        "store_name": "Pizzería Nápoles",
        "address": "Av. Corrientes 500",
        "opening_hours": "Todos los días 20:00 a 01:00",
        "contact_phone": "11 5555-4321",
        "logo_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "theme_color": "red",
    }
    response = public_client.put(CONFIG_URL, json=payload)
    assert response.status_code == 401


def test_admin_can_update_store_config(client, public_client):
    payload = {
        "store_name": "Pizzería Bella Vista",
        "address": "Calle Falsa 123",
        "opening_hours": "Lun a Dom 19:00 a 00:30",
        "contact_phone": "11 9999-8888",
        "logo_url": "data:image/png;base64,test-logo-base64",
        "theme_color": "emerald",
    }
    response = client.put(CONFIG_URL, json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["store_name"] == "Pizzería Bella Vista"
    assert data["address"] == "Calle Falsa 123"
    assert data["opening_hours"] == "Lun a Dom 19:00 a 00:30"
    assert data["contact_phone"] == "11 9999-8888"
    assert data["logo_url"] == "data:image/png;base64,test-logo-base64"
    assert data["theme_color"] == "emerald"
    assert data["login_bg"] == "bistro"

    # Inmediatamente visible para clientes sin autenticación
    pub_res = public_client.get(CONFIG_URL)
    assert pub_res.status_code == 200
    pub_data = pub_res.json()
    assert pub_data["store_name"] == "Pizzería Bella Vista"
    assert pub_data["theme_color"] == "emerald"
    assert pub_data["login_bg"] == "bistro"
    assert pub_data["logo_url"] == "data:image/png;base64,test-logo-base64"


def test_update_store_config_validates_theme_color(client):
    payload = {
        "store_name": "Pizzería Central",
        "address": "Av. Siempre Viva 742",
        "opening_hours": "20 a 24",
        "contact_phone": "11 1111-2222",
        "logo_url": None,
        "theme_color": "color_invalido",
    }
    response = client.put(CONFIG_URL, json=payload)
    assert response.status_code == 422


def test_update_store_config_validates_store_name(client):
    payload = {
        "store_name": "   ",
        "theme_color": "blue",
    }
    response = client.put(CONFIG_URL, json=payload)
    assert response.status_code == 422


def test_update_store_config_validates_login_bg(client):
    payload = {
        "store_name": "Pizzería Central",
        "theme_color": "blue",
        "login_bg": "pizza",  # pizza is no longer allowed, only bistro, kitchen, trattoria
    }
    response = client.put(CONFIG_URL, json=payload)
    assert response.status_code == 422

