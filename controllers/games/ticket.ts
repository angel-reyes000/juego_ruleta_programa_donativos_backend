import { response, type Request, type Response } from "express";
import { pool } from "../../database/db.js";
import { postTicketNumber } from "./tickets_numbers.js";
import { error } from "node:console";

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

        const queryCurrentMaxCapacity = `
            SELECT
                COUNT(DISTINCT d.user_id) AS total_users,
                EXISTS (
                    SELECT 1
                    FROM tickets existing_tickets
                    WHERE existing_tickets.game_id = $1
                      AND existing_tickets.user_id = $2
                ) AS user_already_participating
            FROM donations d
            INNER JOIN tickets t ON t.donation_id = d.id
            WHERE t.game_id = $1
        `;

        const responseUsers = await pool.query(queryCurrentMaxCapacity, [game_id, user_id]);

        const quantityUsers = Number(responseUsers.rows[0].total_users)
        const userAlreadyParticipating = responseUsers.rows[0].user_already_participating;

        if (quantityUsers >= game_max_capacity && !userAlreadyParticipating) {
            return "Sin asignacion de ticket por que se alcanzo la maximo cantidad de donadores participantes."
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
