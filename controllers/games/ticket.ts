import { response, type Request, type Response } from "express";
import { pool } from "../../database/db.js";
import { postTicketNumber } from "./tickets_numbers.js";
import { error } from "node:console";
import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";

interface RequestAuth extends Request {
    user: {
        id?: number
        role: string
    }
}

export async function getTickets (req: RequestAuth, res: Response) {
    try {

        const user_id = req.user.id;

        if (!user_id) {
            return res.status(400).json({
                "error": "Error al obtener tickets."
            })
        }

        const { game_id } = req.query;

        const query = `SELECT t.*, tn.number AS ticket_number FROM tickets t LEFT JOIN tickets_numbers tn ON tn.ticket_id = t.id WHERE t.user_id = $1 AND t.game_id = $2`

        const values = [user_id, game_id];

        const response = await pool.query(query, values);

        const data = response.rows;
        //console.log(data);

        return res.status(200).json(data);

    } catch (error) {
        console.log("Error in getTickets backend: ", error);
        res.status(400).json({
            "error": "Error al obtener el total de tickets."
        })
    }
}

// El cupo se cierra cuando el juego activo hace su primer giro.
export async function activeGameHasStarted () {
    const query = `SELECT 1 FROM games g
                   WHERE CURRENT_TIMESTAMP BETWEEN g.start_datetime AND g.end_datetime
                   AND EXISTS (
                       SELECT 1 FROM spins s
                       INNER JOIN rounds r ON r.id = s.round_id
                       WHERE r.game_id = g.id
                   ) LIMIT 1`;

    const response = await pool.query(query);

    return (response.rowCount ?? 0) > 0;
}

// Al iniciar el sorteo, si no se alcanzo la capacidad maxima se reparten los tickets faltantes entre los
// participantes de forma proporcional a los tickets que ya tienen (quien tiene mas recibe mas; algunos pueden
// no recibir ninguno). Si ya se alcanzo la capacidad no hace nada. Debe ejecutarse dentro de la transaccion del cliente recibido.
export async function fillGameCapacity (client: PoolClient, game_id: number) {
    const dataGame = await client.query(`SELECT max_capacity FROM games WHERE id = $1`, [game_id]);
    const max_capacity = Number(dataGame.rows[0]?.max_capacity);

    const dataUsers = await client.query(
        `SELECT user_id, COUNT(*)::int AS total, MAX(donation_id) AS donation_id
         FROM tickets WHERE game_id = $1 GROUP BY user_id`,
        [game_id]
    );

    const participants: Array<{ user_id: number, total: number, donation_id: number }> = dataUsers.rows;
    const current = participants.reduce((sum, p) => sum + p.total, 0);

    if (!Number.isFinite(max_capacity) || participants.length === 0 || current >= max_capacity) {
        return { added: 0, before: current, after: current };
    }

    // Se baraja para que los empates en los residuos se resuelvan al azar.
    for (let i = participants.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [participants[i], participants[j]] = [participants[j]!, participants[i]!];
    }

    // Metodo del mayor residuo: parte entera proporcional + los tickets sobrantes a los mayores residuos.
    const missing = max_capacity - current;
    const extra = participants.map((p) => Math.floor((missing * p.total) / current));
    let leftover = missing - extra.reduce((sum, value) => sum + value, 0);

    const byRemainder = participants
        .map((p, index) => ({ index, remainder: (missing * p.total) % current }))
        .sort((a, b) => b.remainder - a.remainder);

    for (let k = 0; leftover > 0; k = (k + 1) % byRemainder.length, leftover--) {
        extra[byRemainder[k]!.index]!++;
    }

    const user_ids: number[] = [];
    const donation_ids: number[] = [];

    participants.forEach((p, index) => {
        for (let k = 0; k < extra[index]!; k++) {
            user_ids.push(p.user_id);
            donation_ids.push(p.donation_id);
        }
    });

    await client.query(
        `INSERT INTO tickets (user_id, game_id, donation_id)
         SELECT u, $1, d FROM unnest($2::int[], $3::int[]) AS x(u, d)`,
        [game_id, user_ids, donation_ids]
    );

    return { added: user_ids.length, before: current, after: current + user_ids.length };
}

export async function postTickets (user_id: number, donation_id: number, total_tickets: number) {
    try {

        if (await activeGameHasStarted()) {
            return "El sorteo ya inicio, ya no se asignan tickets."
        }

        const queryGame = `SELECT id, max_capacity FROM games 
                        WHERE CURRENT_TIMESTAMP BETWEEN start_datetime AND end_datetime LIMIT 1`;

        const dataGame = await pool.query(queryGame);

        const game_id = dataGame.rows[0].id;

        if (!game_id) {
            return "No hay juegos actualmente activos para proporcionarte tickets."
        }

        const game_max_capacity = dataGame.rows[0].max_capacity;

        const queryCurrentOccupiedSlots = `
            SELECT COUNT(*) AS total_tickets
            FROM tickets
            WHERE game_id = $1
        `;

        const responseTickets = await pool.query(queryCurrentOccupiedSlots, [game_id]);

        const occupiedSlots = Number(responseTickets.rows[0].total_tickets)

        if (occupiedSlots + total_tickets > game_max_capacity) {
            return "Sin asignacion de ticket por que no hay suficiente cupo disponible en el juego."
        }

        const query = `INSERT INTO tickets (user_id, game_id, donation_id)
                       VALUES ($1, $2, $3) RETURNING *`;
        const values = [user_id, game_id, donation_id];

        let list_tickets: Array<object> = [];
        for (let i = 0; i < total_tickets; i++) {
            const result = await pool.query(query, values);
            const dataTicket = result.rows[0];
            await postTicketNumber(dataTicket.id)
            list_tickets.push(dataTicket);
        }        

        //console.log(list_tickets);
        return `Se han añadido ${list_tickets.length} tickets al juego.`

    } catch (error) {
        console.log("Error at postTickets backend: ", error)
        return "Error al generar tus tickets."
    }
}
