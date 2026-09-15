import type { Request, Response } from "express";
import { pool } from "../../database/db.js";
import { postTicketNumber } from "./tickets_numbers.js";

interface RequestAuth extends Request {
    user: {
        id: number
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

        const queryGameId = `SELECT id FROM games 
                        WHERE CURRENT_TIMESTAMP BETWEEN start_datetime AND end_datetime LIMIT 1`;

        const dataGameId = await pool.query(queryGameId);

        const game_id = dataGameId.rows[0].id;

        if (!game_id) {
            return "No hay juegos actualmente activos para proporcionarte tickets."
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
