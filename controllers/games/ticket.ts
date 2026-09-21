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

        const query = `SELECT * FROM tickets WHERE user_id = $1 AND game_id= $2`

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

export async function postTickets (user_id: number, donation_id: number, total_tickets: number) {
    try {

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

export async function deleteTicket (req: RequestAuth, res: Response) {
    try {

        const roleUser = req.user.role;

        if (roleUser !== 'admin' || !roleUser) {
            return res.status(400).json({
                "error": "No tienes permitido eliminar tickets."
            })
        }

        const { game_id, winning_number } = req.body;

        const query = `DELETE FROM tickets
                            WHERE id IN (
                                SELECT t.id
                                FROM tickets t
                                INNER JOIN tickets_numbers tn
                                    ON tn.ticket_id = t.id
                                WHERE tn.number = $1
                                AND t.game_id = $2
                                AND t.id IN (
                                    SELECT MIN(t2.id)
                                    FROM tickets t2
                                    INNER JOIN tickets_numbers tn2
                                        ON tn2.ticket_id = t2.id
                                    WHERE tn2.number = $1
                                    AND t2.game_id = $2
                                    GROUP BY t2.user_id
                                )
                            )
                            RETURNING *`;

        const values = [winning_number, game_id];

        const response = await pool.query(query, values);

        const data = response.rows

        console.log("Data borrada: ", data);

        return res.status(200).json(data);

    } catch (error) {
        console.log("Error in deleteTicket: ", error)
        res.status(400).json({
            "error": "Error al restar tickets."
        })
    }
}