import type { Request, Response } from "express";
import { pool } from "../../database/db.js";

interface RequestAuth extends Request {
    user: {
        role: string
    }
}

interface Prize {
    name: string
    type: string
    value: number
    round: number
}

export async function getPrizes (req: RequestAuth, res: Response) {
    try {
        const roleUser = req.user.role;
        const { gameId } = req.query;

        if (roleUser !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permiso para crear"
            })
        }

        const query = "SELECT * FROM prizes WHERE game_id = $1";

        const response = await pool.query(query, [gameId, ])

        const data = response.rows

        res.status(200).json(
            data
        )

    } catch (error) {
        console.log("Error in getPrizes: ", error)
        return res.status(400).json({
            "error": "Error al obtener premios del juego."
        })
    }
}

export async function postPrize (req: RequestAuth, res: Response) {
    try {

        const roleUser = req.user.role;

        if (roleUser !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permiso para crear"
            })
        }

        const { name, type, value, round, game_id } = req.body;

        if (!name || !type || !value || !round || !game_id) {
            return res.status(400).json({
                "error": "Campos faltantes"
            })
        }

        if (name.length > 100 || round > 5 || round < 1) {
            return res.status(400).json({
                "error": "Campos invalidos"
            })
        }

        const query = `INSERT INTO prizes (name, type, value, round, game_id)
                        VALUES ($1, $2, $3, $4, $5) RETURNING *`;

        const values = [name, type, value, round, game_id];

        const response = await pool.query(query, values);

        const data = response.rows[0]

        //console.log(data)

        return res.status(200).json(
            data
        )

    } catch (error) {
        console.log("Error in postPrize: ", error)
        return res.status(400).json({
            "error": "Error al obtener premios del juego."
        })
    }
}

//This function is called when the endpoint of postGame is called (Function inside of function postGame)
export async function postPrizes (gameID: number, prize_list: Prize[]) {
    try {

        if (prize_list.length === 0) {
            console.log("Length of prizes: 0, whitout problems")
            return 
        }

        if (!gameID) {
            console.log("Error at receive the gameID")
            return
        }

        const query = `INSERT INTO prizes (name, type, value, round, game_id)
                        VALUES ($1, $2, $3, $4, $5) RETURNING *`;

        let list_data = []
        for (const obj of prize_list) {
            const values = [obj.name, obj.type, obj.value, obj.round, gameID]

            if (obj.round > 5 || obj.round < 1) {
                const error = "Error al crear premio, numero maximo en ronda 5 y minimo de 1";
                console.log(error);
                continue;
            }

            const response = await pool.query(query, values);
            const data = response.rows
            list_data.push(data)
        }

        //console.log("LISTA DE PRIZES: ", list_data)

    } catch (error) {
        console.log("Error in postPrizes backend: ", error);
    }
}