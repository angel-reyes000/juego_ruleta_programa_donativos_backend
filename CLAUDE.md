# Backend de juego de ruleta y donativos

## Propósito

Backend HTTP y WebSocket para una aplicación de donativos que entrega tickets para juegos de ruleta. Está implementado con TypeScript, Express, PostgreSQL (`pg`), JWT, bcrypt, Stripe y Socket.IO.

El proyecto no tiene una capa de servicios ni un ORM: las rutas llaman directamente a funciones de controlador y los controladores ejecutan SQL parametrizado mediante el `pool` compartido.

## Cómo ejecutar

Requisitos:

- Node.js y npm.
- PostgreSQL accesible.
- Variables de entorno configuradas en `.env` (este archivo está ignorado por Git y sus valores nunca deben copiarse a este documento).

Variables requeridas:

```text
HOST
PORT                 # Puerto de PostgreSQL, no el puerto HTTP
DATABASE_NAME
USER
PASSWORD
API_KEY_FRONTEND     # Origen permitido por la configuración CORS de Socket.IO
JWT_SECRET
STRIPE_SECRET_KEY
```

Comandos definidos en `package.json`:

```bash
npm install
npm run dev          # tsx watch server.ts
npm run build        # tsc
npm start            # node server.js; requiere que exista una compilación compatible
```

El servidor HTTP escucha en el puerto `4000`, independientemente de `PORT`, que se usa para PostgreSQL. Al iniciar intenta conectarse a la base de datos.

## Estructura

```text
server.ts                         # Arranque, middleware, rutas y Socket.IO
database/db.ts                    # Pool PostgreSQL y conexión inicial
controllers/
	users/user.ts                   # Registro, login, JWT, auth y consultas de usuarios
	users/dataUser.ts               # Devuelve el usuario decodificado del JWT
	users/donations.ts              # Payment Intent de Stripe y registro de donaciones
	games/game.ts                   # CRUD parcial de juegos
	games/prize.ts                  # Premios y carga masiva de premios
	games/round.ts                  # Rondas y selección de ronda actual
	games/spin.ts                   # Giro transaccional: ronda, número, eliminación, reasignación y ganadores
	games/ticket.ts                 # Tickets y cierre de cupo (activeGameHasStarted)
	games/tickets_numbers.ts        # Número de ticket y reasignación balanceada de números
	games/winning_tickets.ts        # Historial de resultados y ganadores con premio (admin)
package.json                      # Dependencias y scripts
package-lock.json                 # Versiones exactas de npm
tsconfig.json                     # TypeScript estricto, módulo nodenext
.gitignore                        # Ignora node_modules, build, .env y artefactos
```

No se debe editar `node_modules` ni `package-lock.json` manualmente. Si cambia una dependencia, usar npm para actualizar ambos archivos.

## Arranque y composición

`server.ts` hace lo siguiente:

1. Carga `.env` con `dotenv`.
2. Crea Express y un servidor HTTP.
3. Configura Socket.IO con `origin: process.env.API_KEY_FRONTEND`.
4. Habilita `cors()` global y `express.json()`.
5. Registra las rutas descritas abajo.
6. Registra los eventos Socket.IO.
7. Escucha en `4000` y llama a `connectionDB()`.

Las importaciones locales usan extensión `.js` porque el proyecto usa `module: "nodenext"` y `type: "module"`.

## Autenticación y autorización

El login firma un JWT con `JWT_SECRET`, con duración de una hora. El payload contiene `id`, `name`, `last_name`, `role`, `email`, `phone_number` y `created_at`.

Las rutas protegidas esperan:

```http
Authorization: Bearer <jwt>
```

`auth` verifica el token y asigna el payload a `req.user`. Las operaciones administrativas comprueban `req.user.role === "admin"`. No crear otra estrategia de autenticación sin actualizar todos los controladores y este documento.

Importante al modificar `auth`: cuando falta el token, actualmente envía `400` pero no hace `return`; una petición sin token puede continuar hasta el intento de verificación. Si se corrige, preservar una única respuesta y usar un código coherente en todas las rutas.

## API HTTP

Todas las respuestas son JSON. Los nombres de parámetros reflejan el código existente y no deben cambiarse sin coordinar con el frontend.

### Usuarios y cuenta

| Método | Ruta | Auth | Función |
|---|---|---|---|
| GET | `/api/users` | No | `getUsers`; devuelve todos los registros de `users`. Revisar exposición de datos antes de usar en producción. |
| POST | `/api/users` | No | `postUser`; crea usuario, valida longitudes, hashea contraseña con bcrypt y rechaza email repetido. |
| POST | `/api/loginUser` | No | `loginUser`; valida credenciales y devuelve `{ token }`. |
| GET | `/api/getUsersWithDonation?game_id=...` | Sí | Cuenta el total de tickets (espacios ocupados) del juego; el nombre del endpoint y de la variable de respuesta se conservan por compatibilidad con el frontend. |
| GET | `/api/getDataUser` | Sí | Devuelve el payload del JWT. |

Registro: `name`, `last_name`, `email`, `password`, `phone_number`. El teléfono debe tener exactamente 10 caracteres; nombre/apellido máximo 30, email máximo 50 y contraseña máximo 15.

### Donaciones y Stripe

| Método | Ruta | Auth | Función |
|---|---|---|---|
| POST | `/api/paymentIntent` | Sí | Crea un PaymentIntent Stripe en MXN y devuelve `{ clientSecret }`. |
| POST | `/api/createPayment` | Sí | Inserta la donación y crea tickets para el juego activo. |

Ambas operaciones esperan `amount` y `card_holder`; `paymentIntent` también exige `check_box`. El monto permitido es de $100 a $10,000 MXN y debe ser múltiplo de $100. Cada $100 genera un ticket. `postDonation` usa el `id` del usuario autenticado y busca el juego activo por fecha.

### Juegos

| Método | Ruta | Auth | Función |
|---|---|---|---|
| GET | `/api/getGames` | Sí/admin | Lista juegos. |
| GET | `/api/getCurrentGame` | Sí | Devuelve el juego cuyo timestamp actual está entre inicio y fin. |
| POST | `/api/postGames` | Sí/admin | Inserta juego, crea sus premios de `prize_list` y cinco rondas. |
| PUT | `/api/updateGame` | Sí/admin | Actualiza `title`, fechas, capacidad y descripción por `gameId`. |

Al crear un juego, `postGames` llama a `postPrizes(gameID, prize_list)` y `postRounds(gameID)`. Esas llamadas son asíncronas y actualmente no se esperan (`await`); tenerlo presente al corregir consistencia o errores parciales.

### Premios

| Método | Ruta | Auth | Función |
|---|---|---|---|
| GET | `/api/getPrizes?gameId=...` | Sí | Lista premios por juego. |
| POST | `/api/postPrize` | Sí/admin | Inserta un premio. |
| DELETE | `/api/deletePrize` | Sí/admin | Borra por `prize_id` y `game_id`. |

Un premio usa `name`, `type`, `value`, `round`, `roulette_number` y `game_id`. Las rondas válidas son 1 a 5 y los números de ruleta 1 a 10. `Prize` es la interfaz exportada desde `prize.ts` y también se usa en el evento Socket.IO `prizesUpdated`.

### Rondas y giros

| Método | Ruta | Auth | Función |
|---|---|---|---|
| GET | `/api/getRounds?game_id=...` | Sí | Lista rondas del juego. |
| GET | `/api/getCurrentRoundGame?game_id=...` | Sí | Devuelve la primera ronda con giros pendientes (o la 5 si terminó) con `total_current_spins` = giros hechos **en esa ronda**. |
| POST | `/api/postSpin` | Sí/admin | Giro transaccional (ver reglas). Solo usa `round_id` del body para ubicar el juego; la ronda la decide el servidor. |

`postRounds` crea cinco rondas con spins configurados `[5, 4, 1, 1, 9]`. `getSpins` sigue incompleta y no es una API funcional.

### Reglas del sorteo (implementadas en `postSpin`)

Flujo de tickets: R1 5,000→2,500, R2 2,500→1,000, R3 1,000→100, R4 100→10, R5 los 10 restantes ganan premio.

En la ronda 5 solo hay 9 giros reales (`rounds.spins = 9`): cuando el giro 9 completa la ronda y queda exactamente un número sin salir, `postSpin` le asigna automáticamente el premio a ese número (mismo registro en `spins`, `winning_tickets` y `game_winners`, con `spin_number = 10`, sin necesidad de otro giro del admin). Ese resultado se devuelve en el campo `auto_assigned` de la respuesta (mismo shape que el giro normal, incluyendo `winners`); es `null` cuando no aplica. El frontend muestra el contador "Giro X/10" en la ronda 5 (en vez de "X/9") para que el giro automático se vea como el décimo giro; internamente `rounds.spins` sigue en 9 porque es lo que determina cuándo el servidor considera terminada la ronda.

- El cupo se cierra en el primer giro del juego: `activeGameHasStarted` bloquea `paymentIntent`, `createPayment` y `postTickets`. El admin puede iniciar cuando quiera, pero necesita al menos un ticket.
- En el primer giro y al final de cada ronda (1-4) `reassignActiveTicketNumbers` baraja con `crypto.randomInt` y reparte números 1-10 en rotación: cada número tiene la misma cantidad de tickets (500 c/u con 5,000) y con 10 tickets cada uno recibe uno distinto.
- Dentro de una ronda el número ganador no se repite (además hay índice único `spins(round_id, winning_number)`).
- Avanzan usuarios, no tickets sueltos: si un usuario tiene un ticket activo con el número ganador de un giro, se registra en `game_winners` (un solo registro por usuario y giro, con su ticket coincidente de menor `id`). No se le resta ningún ticket.
- Al completar una ronda 1-4 todos los tickets de los usuarios que no ganaron ningún giro de la ronda (sin registro en `game_winners` para esa ronda) pasan a `status='eliminated'` con `eliminated_round`; los usuarios que sí ganaron siguen con todos sus tickets, que se renumeran. Ya no se borran tickets. Con usuarios de varios tickets pueden avanzar más de 2,500 / 1,000 / 100 / 10 tickets.
- En todas las rondas ese ticket ganador se registra en `game_winners` (rondas 1-3: avanza; rondas 4-5: además recibe el premio de ese giro). `postSpin` solo devuelve `winners` (para la animación) en las rondas 4 y 5.
- Cada giro inserta también su fila en `winning_tickets` (`spin_number` es 1-based dentro de la ronda). `postSpin` bloquea el juego con `SELECT ... FOR UPDATE` y todo va en una transacción.
- Respuesta de `postSpin`: fila del spin más `game_id`, `round_number`, `spin_number`, `prize_name`, `round_completed`, `active_tickets`, `winners` (`[{user_id, display_name}]`, nombre + inicial del apellido) y `auto_assigned` (ver ronda 5 arriba; `null` salvo en el giro 9 de la ronda 5).
- Los endpoints `deleteTicket` y `postWinningTickets` se eliminaron: el primero borraba a los ganadores y el segundo permitía a cualquier usuario escribir resultados.

### Tickets y resultados

| Método | Ruta | Auth | Función |
|---|---|---|---|
| GET | `/api/getTickets?game_id=...` | Sí | Tickets del usuario autenticado (incluye `status`). |
| GET | `/api/getWinningTickets?game_id=...` | Sí | Historial descendente de resultados. |
| GET | `/api/getGameWinners?game_id=...` | Sí/admin | Ganadores solo de la ronda 5 (premiados finales), un renglón por usuario y giro (`round_number`, `spin_number`, `winning_number`, `prize_name`, `name`, `last_name`, `email`, `phone_number`, `tickets`). |

`postTickets` obtiene el juego activo, impone `max_capacity` por cantidad total de tickets ocupados en el juego (cada ticket equivale a un lugar/cupo; si `tickets_ocupados + total_tickets > max_capacity` se rechaza la asignación completa) y crea los tickets, cada uno con un número inicial aleatorio en `tickets_numbers`.

## Socket.IO

Todos los eventos recibidos se emiten a todos los clientes mediante `io.emit`, sin salas ni autenticación adicional.

| Evento | Argumentos recibidos | Resultado emitido |
|---|---|---|
| `spin` | `winning_number`, `dataRoulette`, `winners` | Retransmite los tres argumentos. |
| `prizesUpdated` | `dataRoulette` | Convierte cada premio en `{ id, label }` y añade `itemLabelFontSizeMax: 20`. |
| `updateRoundSpins` | `number`, `spins`, `total_current_spins`, `dataRoulette` | Retransmite los cuatro argumentos. |
| `latestResults` | `winningNumber`, `game_id`, `round_number`, `spin_number`, `prize_name` | Retransmite los cinco argumentos. |

El servidor Socket.IO permite el origen configurado en `API_KEY_FRONTEND`; Express usa además `cors()` sin restricción explícita.

## Base de datos y tablas esperadas

`database/db.ts` exporta `pool`, un `pg.Pool` configurado con `HOST`, `PORT`, `DATABASE_NAME`, `USER` y `PASSWORD`. Las consultas hacen referencia a estas tablas y columnas:

- `users`: `id`, `name`, `last_name`, `email`, `password`, `phone_number`, `role`, `created_at`.
- `games`: `id`, `title`, `start_datetime`, `end_datetime`, `max_capacity`, `description`.
- `prizes`: `id`, `name`, `type`, `value`, `round`, `roulette_number`, `game_id`.
- `rounds`: `id`, `number`, `spins`, `game_id`.
- `spins`: `id`, `winning_number`, `round_id`.
- `donations`: `id`, `user_id`, `amount`, `card_holder`.
- `tickets`: `id`, `user_id`, `game_id`, `donation_id`, `status` (`active`/`eliminated`), `eliminated_round`.
- `tickets_numbers`: `id`, `number`, `ticket_id`.
- `winning_tickets`: `id`, `winning_number`, `game_id`, `round_number`, `spin_number`, `prize_name`, `created_at`.
- `game_winners`: `id`, `game_id`, `user_id`, `ticket_id`, `round_number`, `spin_number`, `winning_number`, `prize_name`, `created_at`.

El esquema de la base de datos se administra a mano fuera de este repositorio: el código de `postSpin`, `getTickets` y `getGameWinners` requiere estas columnas y tabla, y el índice único `spins(round_id, winning_number)` es opcional.

Las consultas usan placeholders `$1`, `$2`, etc. Mantener ese patrón para evitar interpolar valores del usuario en SQL. Las operaciones relacionadas con donación, tickets y capacidad no están dentro de una transacción; una modificación que requiera atomicidad debe usar `pool.connect()`, `BEGIN`, `COMMIT` y `ROLLBACK`.

## Reglas para cambios

1. Leer el controlador dueño de la funcionalidad y la ruta correspondiente en `server.ts` antes de editar.
2. Mantener TypeScript estricto y las importaciones ESM con extensión `.js`.
3. No cambiar nombres de campos, query params, códigos de respuesta o eventos sin actualizar el consumidor frontend.
4. Mantener las consultas parametrizadas; no interpolar `req.body`, `req.query` o valores del JWT en SQL.
5. No registrar tokens, contraseñas, claves Stripe ni datos de tarjeta en logs.
6. Validar presencia y tipo de entradas antes de operar con `.length`, comparaciones numéricas o consultas.
7. Las comprobaciones de rol deben mantenerse en el servidor; ocultar controles en el frontend no es autorización.
8. Si se cambia una tabla, actualizar las consultas relacionadas y documentar la migración necesaria; no existe carpeta de migraciones en este repositorio.
9. Después de cambios, ejecutar `npm run build`; para cambios de ejecución probar `npm run dev` con PostgreSQL y las variables de entorno disponibles.
10. No copiar valores de `.env` a código, documentación, logs ni commits.

## Riesgos conocidos que considerar al modificar

- `getUsers` devuelve todos los campos, potencialmente contraseñas hasheadas y datos personales.
- Algunos controladores responden `400` para autorización, validación y errores internos; conservar compatibilidad al corregirlo o cambiarlo de forma coordinada.
- Varias validaciones usan comprobaciones de truthiness, por lo que valores `0` pueden rechazarse aunque sean numéricamente válidos.
- `postGames` y `postDonation` no garantizan atomicidad entre las inserciones relacionadas.
- El número ganador y las reasignaciones usan `crypto.randomInt`; solo el número inicial de cada ticket (`postTicketNumber`) usa `Math.random()` y se reemplaza en el primer giro.
- Los eventos Socket.IO (`spin`, `latestResults`, ...) no están autenticados: cualquier cliente puede emitirlos.
- El juego debe seguir dentro de `start_datetime`-`end_datetime` mientras se gira, porque `getCurrentGame` filtra por ese rango.
- No hay suite de tests en el repositorio. El mínimo de verificación disponible es `npm run build` y pruebas manuales de endpoints/eventos.
