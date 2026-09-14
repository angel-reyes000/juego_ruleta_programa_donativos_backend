import type { Request, Response } from "express";
import { pool } from "../../database/db.js";

interface RequestAuth extends Request {
    user: {
        role: string
    }
}

export async function getSpins (round_ids: Array<number>) {
    try {
        const query = `SELECT * FROM spins WHERE round_id IN ($1, $2, $3, $4, $5)`;

        //get datos del juego --> get datos de la ronda --> get datos de giros

    } catch (error) {
        console.log("Error in getSpins: ", error)
        return "Error al registrar el giro, intentalo de nuevo."
    }
}

export async function postSpin (req: RequestAuth, res: Response) {
    try {
        
        const roleUser = req.user.role;

        if (roleUser !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permitido realizar giros."
            })
        }

        const { round_id } = req.body;

        const query = `INSERT INTO spins (winning_number, round_id)
                       VALUES ($1, $2) RETURNING *`

        const random_number = Math.floor(Math.random() * 10) + 1;
        console.log("Numero random: ", random_number)

        const values = [random_number, round_id]

        const data = await pool.query(query, values)

        const result = data.rows[0]
        console.log(result)

        return res.status(200).json(result)

    } catch (error) {
        console.log("Error in postSpin: ", error)
        return res.status(400).json({
            "error": "Error al realizar tu giro."
        })
    }
}