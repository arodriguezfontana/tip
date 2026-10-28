# Integración con WhatsApp (Cloud API oficial de Meta)

El bot puede atender por WhatsApp usando la **WhatsApp Business Platform (Cloud API)**. Funciona igual que
en Telegram: el cliente escribe, el bot responde, los pedidos quedan registrados (con el canal de origen) y
el local le avisa los cambios de estado por el mismo chat.

## 1. Elegir el canal

En `backend/.env`:

```env
BOT_CHANNELS=whatsapp            # solo WhatsApp
BOT_CHANNELS=telegram            # solo Telegram (valor por defecto)
BOT_CHANNELS=telegram,whatsapp   # los dos a la vez
```

Cambiar de canal es cambiar esta línea y reiniciar la API. Cada canal habilitado exige sus credenciales: si
falta alguna, la API no arranca y dice cuál. Un canal deshabilitado responde `404` en su webhook.

## 2. Obtener las credenciales en Meta

1. Entrá a <https://developers.facebook.com/apps> y creá una app de tipo **Business** (o usá una existente).
2. En la app, agregá el producto **WhatsApp** (*Add product → WhatsApp → Set up*). Pide asociar (o crear) una
   cuenta de Meta Business.
3. Andá a **WhatsApp → API Setup** (*Configuración de la API*). Ahí están:
   - **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`. Es el id del número, **no** el número de teléfono.
   - Un **token de acceso temporal** (dura 24 h, sirve para probar).
4. **Token permanente** (para producción): en **Business Settings → Users → System users** creá un usuario
   del sistema, asignale la app y la cuenta de WhatsApp con control total, y generá un token con los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management`. Ese token va en `WHATSAPP_ACCESS_TOKEN`.
5. **App secret** → en **App settings → Basic**, botón *Show* de "App secret". Va en `WHATSAPP_APP_SECRET`. Con
   él la API comprueba la firma de cada mensaje que llega, para rechazar llamadas que no vengan de Meta.
6. **Verify token** → `WHATSAPP_VERIFY_TOKEN`. Lo inventás vos (un texto largo y aleatorio) y lo cargás en el
   `.env` y en Meta (paso siguiente).

| Variable | De dónde sale |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Token de acceso (temporal o de usuario del sistema) |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup → *Phone number ID* |
| `WHATSAPP_APP_SECRET` | App settings → Basic → *App secret* |
| `WHATSAPP_VERIFY_TOKEN` | Texto elegido por vos |
| `WHATSAPP_API_VERSION` | Opcional (por defecto `v21.0`) |

Estos valores son secretos: van solo en el `.env` (que no se sube al repositorio), nunca en el código.

## 3. Configurar el webhook

A diferencia de Telegram, **WhatsApp no permite registrar el webhook por API**: se carga a mano en Meta.

1. El backend tiene que ser accesible por **HTTPS** desde internet (en desarrollo, un túnel como ngrok: la
   misma URL fija que ya se usa en `PUBLIC_URL`).
2. En **WhatsApp → Configuration → Webhook** (*Edit*):
   - **Callback URL**: `https://<tu-dominio>/api/v1/whatsapp/webhook`
   - **Verify token**: el mismo valor de `WHATSAPP_VERIFY_TOKEN`.
   - *Verify and save*. Meta hace un `GET` con un desafío y la API lo responde si el token coincide.
3. En la misma pantalla, en **Webhook fields**, suscribite al campo **`messages`**.
4. **Suscribí la app a tu cuenta de WhatsApp (paso fácil de olvidar).** El botón *Probar* del webhook funciona
   sin esto, pero los mensajes reales no llegan. Copiá el *WhatsApp Business Account ID* (WhatsApp → API
   Setup) y ejecutá, con el backend levantado:

   ```bash
   docker compose exec backend python -c "import httpx; from app.core.config import settings as s; r = httpx.post('https://graph.facebook.com/v21.0/<WABA_ID>/subscribed_apps', headers={'Authorization': 'Bearer ' + s.WHATSAPP_ACCESS_TOKEN}); print(r.status_code, r.text)"
   ```

   Tiene que responder `200 {"success": true}`. Con `GET` en la misma URL se ve a qué apps está suscripta la
   cuenta.
5. **Publicá la app** (menú *Publicar*). Con la app sin publicar Meta solo manda eventos de prueba, no los
   mensajes reales. Pide una URL pública de política de privacidad (puede ser una página de Notion o Google
   Docs) y una categoría; para usar tu propio número no hace falta revisión de Meta.

## 4. Probar

1. En **API Setup** agregá tu número personal como destinatario de prueba (el número de prueba de Meta solo
   escribe a números verificados).
2. Mandá un mensaje al número de prueba de Meta desde ese teléfono. El bot responde.
3. Para ver el flujo completo: pedí el menú, armá un pedido y confirmalo. En el panel el pedido aparece con
   el canal (*Bot · WhatsApp*) y, al cambiarle el estado, el cliente recibe el aviso por WhatsApp.

> **Números de Argentina**: WhatsApp entrega los celulares como `549…` pero Meta los guarda como `54…`.
> Responder al `549…` falla con el error `131030` ("número fuera de la lista permitida"), así que el bot
> les saca el `9` al enviar (`_destinatario` en `app/services/channels/whatsapp.py`). En el log, los rechazos
> de Meta quedan como `WhatsApp respondió 400: {...}` con el motivo.

## 5. Pasar a producción

- Registrá un **número propio** (no el de prueba) en WhatsApp → API Setup → *Add phone number*, y verificá la
  cuenta de Meta Business.
- Usá el token permanente del usuario del sistema (paso 2.4).
- Definí el nombre y perfil del negocio en WhatsApp Manager.

## Limitaciones de WhatsApp a tener en cuenta

- **Ventana de 24 horas**: solo se puede enviar texto libre hasta 24 h después del último mensaje del
  cliente. Los avisos de cambio de estado del pedido que salgan después (ej. un pedido programado para otro
  día) los rechaza Meta y quedan en el log como `Error al enviar mensaje a WhatsApp`. Para esos casos haría
  falta crear **plantillas de mensaje** aprobadas por Meta; hoy no están implementadas.
- Solo se procesan mensajes de **texto**. Imágenes, audios y ubicaciones se ignoran.
- Las respuestas de WhatsApp se muestran como texto plano (igual que en Telegram).

## Cómo está armado (para quien mantenga el código)

- `app/api/whatsapp_router.py`: `GET /api/v1/whatsapp/webhook` (verificación) y `POST` (mensajes; valida la
  firma `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`).
- `app/services/channels/whatsapp.py`: envío de mensajes y "escribiendo..." contra la Graph API.
- El chat del cliente en WhatsApp es su número de teléfono. La conversación se identifica como
  `whatsapp:<número>` (`app/core/channels.py`), así un mismo número en Telegram y en WhatsApp nunca se mezcla.
- Los pedidos guardan `channel` (`telegram` / `whatsapp`) y `chat_id`; es lo que usan las notificaciones.
- La derivación a un empleado (panel de chats) responde por el canal de cada cliente.
