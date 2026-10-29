import asyncio
from unittest.mock import AsyncMock

from app.services.message_batcher import AgrupadorDeMensajes

# Tiempos chicos para que los tests sean rápidos pero distingan "seguidos" de "separados".
ESPERA = 0.1


def _agrupador(procesar=None, espera=ESPERA, maxima=1.0, al_empezar=None):
    procesar = procesar or AsyncMock()
    return AgrupadorDeMensajes(procesar, espera_segundos=espera, espera_maxima_segundos=maxima, al_empezar=al_empezar), procesar


def test_dos_mensajes_seguidos_se_responden_una_sola_vez_juntos():
    agrupador, procesar = _agrupador()

    async def escenario():
        agrupador.recibir("1", "Hola")
        await asyncio.sleep(ESPERA / 3)
        agrupador.recibir("1", "Quisiera hacer un pedido")
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    procesar.assert_awaited_once_with("1", "Hola\nQuisiera hacer un pedido")


def test_un_solo_mensaje_se_responde_pasada_la_espera_y_no_antes():
    agrupador, procesar = _agrupador()

    async def escenario():
        agrupador.recibir("1", "Hola")
        await asyncio.sleep(ESPERA / 3)
        antes = procesar.await_count
        await asyncio.sleep(ESPERA * 3)
        return antes

    assert asyncio.run(escenario()) == 0
    procesar.assert_awaited_once_with("1", "Hola")


def test_cada_mensaje_nuevo_reinicia_la_espera():
    agrupador, procesar = _agrupador()

    async def escenario():
        # Tres mensajes separados por menos que la espera, pero que suman más que ella.
        for texto in ("uno", "dos", "tres"):
            agrupador.recibir("1", texto)
            await asyncio.sleep(ESPERA * 0.7)
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    procesar.assert_awaited_once_with("1", "uno\ndos\ntres")


def test_mensajes_separados_por_mas_que_la_espera_se_responden_por_separado():
    agrupador, procesar = _agrupador()

    async def escenario():
        agrupador.recibir("1", "Hola")
        await asyncio.sleep(ESPERA * 3)
        agrupador.recibir("1", "Quiero una muzza")
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    assert [c.args for c in procesar.await_args_list] == [("1", "Hola"), ("1", "Quiero una muzza")]


def test_los_mensajes_de_chats_distintos_no_se_mezclan():
    agrupador, procesar = _agrupador()

    async def escenario():
        agrupador.recibir("1", "Hola, soy Ana")
        agrupador.recibir("2", "Hola, soy Beto")
        agrupador.recibir("1", "Quiero una muzza")
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    respuestas = {c.args for c in procesar.await_args_list}
    assert respuestas == {("1", "Hola, soy Ana\nQuiero una muzza"), ("2", "Hola, soy Beto")}


def test_nunca_hay_dos_respuestas_a_la_vez_en_un_mismo_chat():
    en_curso = 0
    maximo = 0
    atendidos: list[str] = []

    async def procesar(chat_id, texto):
        nonlocal en_curso, maximo
        en_curso += 1
        maximo = max(maximo, en_curso)
        await asyncio.sleep(ESPERA * 4)  # la IA tarda más que la espera
        atendidos.append(texto)
        en_curso -= 1

    agrupador, _ = _agrupador(procesar)

    async def escenario():
        agrupador.recibir("1", "Hola")
        await asyncio.sleep(ESPERA * 2)  # ya se está respondiendo "Hola"
        agrupador.recibir("1", "Quiero")
        await asyncio.sleep(ESPERA / 2)
        agrupador.recibir("1", "una muzza")
        await asyncio.sleep(ESPERA * 12)

    asyncio.run(escenario())

    assert maximo == 1
    # Lo que llegó mientras se respondía espera su turno y se contesta junto.
    assert atendidos == ["Hola", "Quiero\nuna muzza"]


def test_el_tope_evita_postergar_la_respuesta_si_el_cliente_no_para_de_escribir():
    agrupador, procesar = _agrupador(espera=ESPERA, maxima=ESPERA * 4)

    async def escenario():
        for i in range(12):
            agrupador.recibir("1", f"m{i}")
            await asyncio.sleep(ESPERA * 0.6)
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    assert procesar.await_count >= 2
    assert "\n".join(c.args[1] for c in procesar.await_args_list) == "\n".join(f"m{i}" for i in range(12))


def test_avisa_el_inicio_solo_con_el_primer_mensaje_de_cada_tanda():
    al_empezar = AsyncMock()
    agrupador, _ = _agrupador(al_empezar=al_empezar)

    async def escenario():
        agrupador.recibir("1", "Hola")
        agrupador.recibir("1", "Quisiera hacer un pedido")
        await asyncio.sleep(ESPERA * 3)
        agrupador.recibir("1", "Gracias")
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    assert [c.args for c in al_empezar.await_args_list] == [("1",), ("1",)]


def test_un_error_al_responder_no_frena_los_mensajes_siguientes():
    procesar = AsyncMock(side_effect=[RuntimeError("falló"), None])
    agrupador, _ = _agrupador(procesar)

    async def escenario():
        agrupador.recibir("1", "Hola")
        await asyncio.sleep(ESPERA * 3)
        agrupador.recibir("1", "¿Están?")
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    assert [c.args for c in procesar.await_args_list] == [("1", "Hola"), ("1", "¿Están?")]


def test_no_deja_estado_acumulado_cuando_termina():
    agrupador, _ = _agrupador()

    async def escenario():
        agrupador.recibir("1", "Hola")
        agrupador.recibir("2", "Hola")
        await asyncio.sleep(ESPERA * 3)

    asyncio.run(escenario())

    assert agrupador._chats == {}
    assert agrupador._tareas == set()


def test_avisa_si_llegaron_mensajes_mientras_se_respondia_el_grupo_anterior():
    estado = {}

    async def procesar(chat_id, texto):
        if texto == "Hola":
            agrupador.recibir("1", "Quiero una muzza")  # llega mientras se responde el primero
            estado["esperando_durante"] = agrupador.hay_mensajes_esperando("1")
        else:
            estado["esperando_al_final"] = agrupador.hay_mensajes_esperando("1")

    agrupador, _ = _agrupador(procesar=procesar)

    async def escenario():
        assert not agrupador.hay_mensajes_esperando("1")
        agrupador.recibir("1", "Hola")
        await asyncio.sleep(ESPERA * 4)

    asyncio.run(escenario())

    assert estado == {"esperando_durante": True, "esperando_al_final": False}
