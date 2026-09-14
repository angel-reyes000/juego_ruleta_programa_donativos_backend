import type { Request, Response } from "express";
import { pool } from "../../database/db.js";

interface RequestAuth extends Request {
    user: {
        id: number
    }
}

export async function getTickets (req: RequestAuth, res: Response) {
    try {

        const user_id = req.user.id;

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
            const data = result.rows[0];
            list_tickets.push(data);
        }        

        //console.log(list_tickets);
        return `Se han añadido ${list_tickets.length} tickets al juego.`

    } catch (error) {
        console.log("Error at postTickets backend: ", error)
        return "Error al generar tus tickets."
    }
}