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
        //console.log("ULTIMOS RESULTADOS: ", data);

        return res.status(200).json(data);

    } catch (error) {
        console.log("Error in getWinningTickets:", error);
        return res.status(500).json({
            "message": "Error al obtener los últimos resultados.",
        });
    }
}

interface RequestAuth extends Request {
    user: {
        role: string
    }
}

// Solo admin: ganadores de la ronda 5 (premiados finales), un renglon por usuario y giro (con su cantidad de tickets ganadores).
export async function getGameWinners(req: RequestAuth, res: Response) {
    try {
        if (req.user.role !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permitido consultar ganadores."
            })
        }

        const { game_id } = req.query;

        if (!game_id) {
            return res.status(400).json({
                error: "El id del juego es obligatorio.",
            });
        }

        const query = `
            SELECT gw.round_number, gw.spin_number, gw.winning_number, gw.prize_name,
                   u.id AS user_id, u.name, u.last_name, u.email, u.phone_number,
                   COUNT(*)::int AS tickets
            FROM game_winners gw
            INNER JOIN users u ON u.id = gw.user_id
            WHERE gw.game_id = $1 AND gw.round_number = 5
            GROUP BY gw.round_number, gw.spin_number, gw.winning_number, gw.prize_name,
                     u.id, u.name, u.last_name, u.email, u.phone_number
            ORDER BY gw.spin_number ASC, u.name ASC, u.last_name ASC
        `;

        const response = await pool.query(query, [game_id, ]);

        return res.status(200).json(response.rows);

    } catch (error) {
        console.log("Error in getGameWinners:", error);
        return res.status(500).json({
            "message": "Error al obtener los ganadores.",
        });
    }
}
