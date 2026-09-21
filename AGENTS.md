# Instrucciones para agentes

## Alcance

Este repositorio es un backend TypeScript para un juego de ruleta financiado mediante donativos. Usa Express, PostgreSQL, JWT, bcrypt, Stripe y Socket.IO.

Antes de modificar código, leer `CLAUDE.md` y el controlador dueño de la funcionalidad. Mantener los cambios pequeños y compatibles con las rutas y eventos existentes.

## Estructura relevante

- `server.ts`: crea Express/HTTP/Socket.IO, registra middleware, rutas y eventos.
- `database/db.ts`: exporta el `pg.Pool` compartido y realiza la conexión inicial.
- `controllers/users/`: usuarios, autenticación, cuenta y donaciones.
- `controllers/games/`: juegos, premios, rondas, giros, tickets y resultados ganadores.
- `package.json`: scripts y dependencias.
- `tsconfig.json`: TypeScript estricto con módulos ESM (`nodenext`).

No editar `node_modules` ni modificar manualmente `package-lock.json`. `.env` está ignorado y contiene secretos: nunca copiar sus valores a código, documentación, logs o respuestas.

## Flujo de trabajo obligatorio

1. Identificar la ruta o evento que controla el comportamiento.
2. Leer el controlador, sus imports y el consumidor inmediato antes de editar.
3. Mantener los nombres actuales de rutas, query params, body fields, respuestas y eventos salvo que el cambio requiera coordinación con frontend.
4. Implementar la corrección en la capa que realmente decide el comportamiento; evitar parches duplicados en `server.ts`.
5. Ejecutar `npm run build` después de cada cambio funcional.
6. Para cambios de runtime, probar `npm run dev` con PostgreSQL y las variables de entorno disponibles.
7. Informar cualquier prueba no ejecutada y cualquier comportamiento preexistente que se haya dejado intacto.

## Convenciones técnicas

- Usar TypeScript estricto y conservar las importaciones locales con extensión `.js`.
- Usar `import type` para tipos cuando corresponda.
- Mantener las consultas PostgreSQL parametrizadas con `$1`, `$2`, etc.; nunca interpolar datos de `req.body`, `req.query` o JWT en SQL.
- Validar presencia y tipo antes de usar `.length`, comparaciones numéricas o acceder a propiedades anidadas.
- Usar `return` después de enviar una respuesta Express para evitar respuestas dobles.
- No añadir abstracciones, dependencias o migraciones sin necesidad concreta y documentación del impacto.
- No añadir comentarios obvios; comentar solo lógica no evidente.

## Autenticación y permisos

El header esperado es `Authorization: Bearer <jwt>`. El middleware `auth` verifica `JWT_SECRET` y asigna el payload a `req.user`.

Las operaciones administrativas deben conservar la comprobación de `req.user.role === "admin"`. No confiar en permisos enviados por el cliente ni en controles visuales del frontend.

El JWT contiene `id`, `name`, `last_name`, `role`, `email`, `phone_number` y `created_at`, y expira en una hora. No registrar tokens, contraseñas, claves Stripe ni datos de tarjeta.

## Contratos de negocio

- El servidor HTTP escucha en `4000`; `PORT` pertenece a la conexión PostgreSQL.
- Un juego activo es aquel cuyo timestamp actual está entre `start_datetime` y `end_datetime`.
- Una donación válida está entre 100 y 10,000 MXN y es múltiplo de 100.
- Cada 100 MXN genera un ticket para el juego activo.
- Cada ticket recibe un número aleatorio entre 1 y 10 en `tickets_numbers`.
- Los juegos crean cinco rondas con capacidades de spins `[5, 4, 1, 1, 10]`.
- Los premios usan rondas 1 a 5 y números de ruleta 1 a 10.
- Los giros y eliminaciones de tickets ganadores requieren rol `admin`.
- La capacidad máxima se calcula por usuarios distintos participantes, no por cantidad total de tickets.

## API y eventos

No renombrar sin coordinación estas rutas principales:

```text
GET    /api/users
POST   /api/users
POST   /api/loginUser
GET    /api/getUsersWithDonation?game_id=...
GET    /api/getDataUser
POST   /api/paymentIntent
POST   /api/createPayment
GET    /api/getGames
GET    /api/getCurrentGame
POST   /api/postGames
PUT    /api/updateGame
GET    /api/getPrizes?gameId=...
POST   /api/postPrize
DELETE /api/deletePrize
GET    /api/getRounds?game_id=...
GET    /api/getCurrentRoundGame?game_id=...
POST   /api/postSpin
GET    /api/getTickets?game_id=...
DELETE /api/deleteTicket
GET    /api/getWinningTickets?game_id=...
POST   /api/postWinningTickets
```

Socket.IO retransmite globalmente `spin`, `prizesUpdated`, `updateRoundSpins` y `latestResults`. No añadir datos sensibles a estos eventos ni asumir que están autenticados.

## Seguridad y consistencia

- `getUsers` devuelve actualmente todos los campos de `users`; no ampliar su exposición sin revisar contraseñas y datos personales.
- Preferir códigos y mensajes compatibles con el frontend; muchos errores existentes usan `400` para validación, autorización y fallos internos.
- Las inserciones de donación, tickets y números no están dentro de una transacción. Si una modificación exige atomicidad, usar una transacción explícita con `BEGIN`, `COMMIT` y `ROLLBACK`.
- Las llamadas que crean premios y rondas después de crear un juego actualmente no se esperan con `await`; corregirlo solo considerando errores parciales y compatibilidad de respuesta.
- `getCurrentRoundGame` asume cinco rondas y placeholders fijos; validar resultados vacíos antes de acceder a índices.
- Los números de ruleta y tickets usan `Math.random()`. No tratarlo como aleatoriedad criptográficamente segura.
- No hay migraciones ni suite de tests en el repositorio. Si se cambia el esquema, documentar SQL o migración requerida.

## Validación mínima

```bash
npm install
npm run build
npm run dev
```

Para un cambio funcional, comprobar al menos la ruta afectada con un JWT válido, rol adecuado y datos inválidos. Para cambios en Socket.IO, comprobar emisor y receptor conectados. Si la base de datos o Stripe no están disponibles, ejecutar igualmente la compilación y declarar la limitación.
