import type { Request, Response } from "express";
import { pool } from "../../database/db.js";

export async function getWinningTickets(req: Request, res: Response) {
    try {
        const { game_id } = req.query;

        if (!game_id) {
            return res.status(400).json({
                error: "El id del juego es obligatorio.",
            });
        }

        const query = `
            SELECT
                wt.id,
                wt.winning_number,
                wt.game_id,
                wt.round_number,
                wt.spin_number,
                wt.prize_name,
                wt.created_at
            FROM winning_tickets wt
            WHERE wt.game_id = $1
            ORDER BY wt.created_at DESC
        `;

        const response = await pool.query(query, [game_id, ]);

        const data = response.rows
        console.log("ULTIMOS RESULTADOS: ", data);

        return res.status(200).json(data);

    } catch (error) {
        console.log("Error in getWinningTickets:", error);
        return res.status(500).json({
            "message": "Error al obtener los últimos resultados.",
        });
    }
}

export async function postWinningTickets(req: Request, res: Response) {
    try {

        const { winning_number, game_id, dataRound, dataSpin, dataPrizes } = req.body;

        if (!winning_number || !game_id || !dataRound || !dataSpin) {
            return res.status(400).json({
                "message": "Datos para registrar en 'Ultimos resultados' incompletos."
            })
        }

        //console.log("DATOS RECIBIDOS: ", winning_number, game_id, dataRound.number, dataRound.total_current_spins)
        const queryPrize = `SELECT * FROM prizes WHERE game_id = $1 AND round = $2 AND roulette_number = $3`;
        const valuesPrize = [game_id, dataRound.number, winning_number]
        const responsePrize = await pool.query(queryPrize, valuesPrize);
        const dataPrizeName = responsePrize.rows.length === 0 ? null : responsePrize.rows[0].name;
        //console.log("DATA PRIZE IDDDD: ", dataPrizeName)
        console.log("Datos recibidos2: ", winning_number, game_id, dataRound.number, dataRound.total_current_spins, dataPrizeName)

        const query = `INSERT INTO winning_tickets (winning_number, game_id, round_number, spin_number, prize_name)
                       VALUES ($1, $2, $3, $4, $5) RETURNING *`
        const values = [winning_number, game_id, dataRound.number, dataRound.total_current_spins, dataPrizeName];

        const response = await pool.query(query, values);

        const data = response.rows[0];
        console.log("HISTORIAL POST:", data);

        return res.status(200).json(data)

    } catch (error) {
        console.log("Error in postWinningTickets:", error);
        return res.status(500).json({
            "message": "Error al registrar el ticket ganador.",
        });
    }
}