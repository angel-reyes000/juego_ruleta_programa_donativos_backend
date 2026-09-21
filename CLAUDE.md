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
	games/spin.ts                   # Giro aleatorio y consulta incompleta de spins
	games/ticket.ts                 # Tickets, números de ticket y eliminación de ganador
	games/tickets_numbers.ts        # Generación del número aleatorio de un ticket
	games/winning_tickets.ts        # Historial de resultados ganadores
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
| GET | `/api/getUsersWithDonation?game_id=...` | Sí | Cuenta usuarios distintos con tickets en un juego. |
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
| GET | `/api/getCurrentRoundGame?game_id=...` | Sí | Cuenta spins y selecciona la ronda según el total acumulado. |
| POST | `/api/postSpin` | Sí/admin | Genera un número aleatorio de 1 a 10 e inserta un spin para `round_id`. |

`postRounds` crea cinco rondas con spins configurados `[5, 4, 1, 1, 10]`. `getSpins` existe como función incompleta y actualmente no ejecuta la consulta ni devuelve datos; no asumir que es una API funcional.

### Tickets y resultados

| Método | Ruta | Auth | Función |
|---|---|---|---|
| GET | `/api/getTickets?game_id=...` | Sí | Tickets del usuario autenticado para un juego. |
| DELETE | `/api/deleteTicket` | Sí/admin | Elimina el primer ticket de cada usuario que tenga el `winning_number` en el juego. |
| GET | `/api/getWinningTickets?game_id=...` | Sí | Historial descendente de resultados ganadores. |
| POST | `/api/postWinningTickets` | Sí | Busca el premio correspondiente e inserta el resultado histórico. |

`postTickets` obtiene el juego activo, impone `max_capacity` por usuarios distintos y crea tantos registros como tickets correspondan. Cada ticket llama a `postTicketNumber`, que asigna un número aleatorio de 1 a 10 en `tickets_numbers`.

`postWinningTickets` espera `winning_number`, `game_id`, `dataRound` y `dataSpin`; usa `dataRound.number` y `dataRound.total_current_spins`, busca el premio por juego/ronda/número y guarda `prize_name`.

## Socket.IO

Todos los eventos recibidos se emiten a todos los clientes mediante `io.emit`, sin salas ni autenticación adicional.

| Evento | Argumentos recibidos | Resultado emitido |
|---|---|---|
| `spin` | `winning_number`, `dataRoulette` | Retransmite ambos argumentos. |
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
- `tickets`: `id`, `user_id`, `game_id`, `donation_id`.
- `tickets_numbers`: `id`, `number`, `ticket_id`.
- `winning_tickets`: `id`, `winning_number`, `game_id`, `round_number`, `spin_number`, `prize_name`, `created_at`.

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
- La selección de ronda en `getCurrentRoundGame` asume que existen cinco rondas y puede fallar con un resultado vacío.
- `getCurrentRoundGame` construye un `IN ($1, $2, $3, $4, $5)` fijo; no reutilizarlo para cantidades variables sin adaptar los placeholders.
- Los números ganadores y de tickets se generan con `Math.random()` y no con un generador seguro; cualquier cambio de reglas de sorteo debe revisar este supuesto.
- No hay suite de tests en el repositorio. El mínimo de verificación disponible es `npm run build` y pruebas manuales de endpoints/eventos.
