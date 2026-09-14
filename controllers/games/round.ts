import type { Request, Response } from "express";
import { pool } from "../../database/db.js";

export async function getCurrentRoundGame (req: Request, res: Response) {
    try {
        const { game_id } = req.query;

        const query = `SELECT * FROM rounds 
                       WHERE game_id = $1 
                       ORDER BY number ASC`;

        const data = await pool.query(query, [game_id, ])
        
        const result = data.rows;
        console.log(result)

        let list_id_rounds = [];
        for (let i = 0; i < result.length; i++){
            list_id_rounds.push(result[i].id)
        }

        const queryTotalSpins = `SELECT COUNT(*) FROM spins WHERE round_id IN ($1, $2, $3, $4, $5)`;

        const data_total_current_spins = await pool.query(queryTotalSpins, list_id_rounds);

        const total_current_spins = Number(data_total_current_spins.rows[0].count)

        console.log("total spins: ", total_current_spins)

        if (total_current_spins <= 5 && result[0].number === 1) {
            return res.status(200).json(result[0])
        } else if (total_current_spins > 5 && total_current_spins < 10 && result[1].number === 2) {
            return res.status(200).json(result[1])
        } else if (total_current_spins === 10 && result[2].number === 3) {
            return res.status(200).json(result[2])
        } else if (total_current_spins === 11 && result[3].number === 4) {
            return res.status(200).json(result[3])
        } else if (total_current_spins > 11 && result[4].number === 5) {
            return res.status(200).json(result[4])
        } else {
            return res.status(400).json({
                "error": "No hay rondas disponibles."
            });
        }

        //return res.status(200).json(result)

    } catch (error) {
        console.log("Error en getCurrentRoundsGames: ", error)
        return res.status(400).json({
            "error": "Error getting data of current rounds game."
        })
    }
}

export async function postRounds (game_id: number) {
    try {
        const query = `INSERT INTO rounds (number, spins, game_id)
                       VALUES ($1, $2, $3) RETURNING *`;

        let list_rounds = [];
        for (let i = 1; i < 6; i++) {
            switch (i) {
                case 1:
                    const result_one = await pool.query(query, [i, 5, game_id])
                    list_rounds.push(result_one.rows[0])
                    break;
                case 2:
                    const result_two = await pool.query(query, [i, 4, game_id])
                    list_rounds.push(result_two.rows[0])
                    break;
                case 3:
                    const result_three = await pool.query(query, [i, 1, game_id])
                    list_rounds.push(result_three.rows[0])
                    break;
                case 4:
                    const result_four = await pool.query(query, [i, 1, game_id])
                    list_rounds.push(result_four.rows[0])
                    break;
                case 5:
                    const result_five = await pool.query(query, [i, 10, game_id])
                    list_rounds.push(result_five.rows[0])
                    break;
            }
        }

        //console.log(list_rounds)
        return "Rondas creadas con exito."

    } catch (error) {
        console.log("Error in postRounds: ", error)
        return "Error al crear rondas del juego"
    }
}