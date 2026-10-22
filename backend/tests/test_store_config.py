CONFIG_URL = "/api/v1/store-config"


def test_public_get_store_config_returns_default(public_client):
    response = public_client.get(CONFIG_URL)
    assert response.status_code == 200
    data = response.json()
    assert data["store_name"] == "RestoIT"
    assert data["theme_color"] == "black"
    assert data["login_bg"] == "bistro"
    assert "address" in data
    assert "opening_hours" not in data
    assert data["login_bg_image"] is None
    assert "contact_phone" in data


def test_modify_store_config_requires_admin(public_client):
    payload = {
        "store_name": "Pizzería Nápoles",
        "address": "Av. Corrientes 500",
        "contact_phone": "11 5555-4321",
        "logo_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "theme_color": "red",
        "login_bg": "kitchen",
    }
    response = public_client.put(CONFIG_URL, json=payload)
    assert response.status_code == 401


def test_admin_can_update_store_config(client, public_client):
    payload = {
        "store_name": "Pizzería Bella Vista",
        "address": "Calle Falsa 123",
        "contact_phone": "11 9999-8888",
        "logo_url": "data:image/png;base64,test-logo-base64",
        "theme_color": "emerald",
        "login_bg": "trattoria",
        "mp_alias": "bellavista.mp",
    }
    response = client.put(CONFIG_URL, json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["store_name"] == "Pizzería Bella Vista"
    assert data["address"] == "Calle Falsa 123"
    assert data["contact_phone"] == "11 9999-8888"
    assert data["logo_url"] == "data:image/png;base64,test-logo-base64"
    assert data["theme_color"] == "emerald"
    assert data["login_bg"] == "trattoria"
    assert data["mp_alias"] == "bellavista.mp"

    # Inmediatamente visible para clientes sin autenticación
    pub_res = public_client.get(CONFIG_URL)
    assert pub_res.status_code == 200
    pub_data = pub_res.json()
    assert pub_data["store_name"] == "Pizzería Bella Vista"
    assert pub_data["theme_color"] == "emerald"
    assert pub_data["login_bg"] == "trattoria"
    assert pub_data["logo_url"] == "data:image/png;base64,test-logo-base64"
    assert pub_data["mp_alias"] == "bellavista.mp"


def test_update_store_config_validates_theme_color(client):
    payload = {
        "store_name": "Pizzería Central",
        "address": "Av. Siempre Viva 742",
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
        "login_bg": "pizza",
    }
    response = client.put(CONFIG_URL, json=payload)
    assert response.status_code == 422


def test_admin_can_upload_custom_login_background(client, public_client):
    image = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=="
    response = client.put(
        CONFIG_URL,
        json={"store_name": "RestoIT", "theme_color": "black", "login_bg": "custom", "login_bg_image": image},
    )
    assert response.status_code == 200

    pub_data = public_client.get(CONFIG_URL).json()
    assert pub_data["login_bg"] == "custom"
    assert pub_data["login_bg_image"] == image


def test_custom_login_background_requires_an_image(client):
    response = client.put(CONFIG_URL, json={"store_name": "RestoIT", "theme_color": "black", "login_bg": "custom"})
    assert response.status_code == 422


def test_login_background_image_must_be_an_image_data_url(client):
    response = client.put(
        CONFIG_URL,
        json={"store_name": "RestoIT", "theme_color": "black", "login_bg": "custom", "login_bg_image": "https://x.com/a.js"},
    )
    assert response.status_code == 422
