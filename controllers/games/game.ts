import type { Request, Response } from 'express';
import { pool } from '../../database/db.js';
import { postPrizes } from './prize.js';
import { postRounds } from './round.js';

interface RequestAuth extends Request {
    user: {
        role: string
    }
}

export async function getGames (req: RequestAuth, res: Response) {
    try {
        const roleUser = req.user?.role;

        if (roleUser !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permiso de acceso."
            })
        }

        const query = `SELECT *, EXISTS (SELECT 1 FROM spins s INNER JOIN rounds r ON r.id = s.round_id WHERE r.game_id = games.id) AS has_started FROM games`;

        const data = await pool.query(query);

        return res.status(200).json(
            data.rows
        )

    } catch (error) {
        console.log("Error en getGames")
        return res.status(400).json({
            "error": "Error getting data of games."
        })
    }
}

export async function getCurrentGame (req: Request, res: Response) {
    try {
        
        const query = `SELECT * FROM games WHERE CURRENT_TIMESTAMP BETWEEN start_datetime AND end_datetime LIMIT 1`;

        const data = await pool.query(query);

        const result = data.rows[0]

        return res.status(200).json(result);

    } catch (error) {
        console.log("Error en getCurrentGames")
        return res.status(400).json({
            "error": "Error getting data of current game."
        })
    }
}

export async function postGames (req: RequestAuth, res: Response) {
    try {

        const roleUser = req.user.role;
        const { title, start_datetime, end_datetime, max_capacity, description, prize_list } = req.body;
        // Si no se envia, la reparticion de tickets queda desactivada.
        const distribute_tickets = typeof req.body.distribute_tickets === 'boolean' ? req.body.distribute_tickets : false;

        if (roleUser !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permiso para crear"
            })
        }

        if (!title || !start_datetime || !end_datetime || !description) {
            return res.status(400).json({
                "error": "Campos faltantes."
            })
        }

        if (title > 100 || max_capacity > 5000) {
            return res.status(400).json({
                "error": "Campos invalidos."
            })
        }

        if (start_datetime > end_datetime) {
            return res.status(400).json({
                "error": "Fecha de finalizacion debe ser mayor que la de inicio."
            })
        }

        const query = `INSERT INTO games (title, start_datetime, end_datetime, max_capacity, description, distribute_tickets)
                        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;

        const values = [title, start_datetime, end_datetime, max_capacity, description, distribute_tickets];

        const response = await pool.query(query, values);

        const data = response.rows[0];

        const gameID = data.id;

        postPrizes(gameID, prize_list);
        postRounds(gameID)

        return res.status(200).json(
            data
        )

    } catch (error) {
        console.log("Error in postGames backend: ", error)
        return res.status(400).json({
            "error": "Error al crear juego."
        })
    }
}

export async function updateGame (req: RequestAuth, res: Response) {
    try {
        const roleUser = req.user.role;
        const { title, start_datetime, end_datetime, max_capacity, description, prize_list, gameId } = req.body;
        // undefined = no cambiar; una vez iniciado el juego el valor ya no se modifica.
        const distribute_tickets = typeof req.body.distribute_tickets === 'boolean' ? req.body.distribute_tickets : null;

        if (roleUser !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permiso para crear"
            })
        }

        if (!title || !start_datetime || !end_datetime || !description) {
            return res.status(400).json({
                "error": "Campos faltantes."
            })
        }

        if (title > 100 || max_capacity > 5000) {
            return res.status(400).json({
                "error": "Campos invalidos."
            })
        }

        if (start_datetime > end_datetime) {
            return res.status(400).json({
                "error": "Fecha de finalizacion debe ser mayor que la de inicio."
            })
        }

        const query = `UPDATE games 
                       SET title = $1, start_datetime = $2, end_datetime = $3, max_capacity = $4, description = $5,
                           distribute_tickets = CASE
                               WHEN EXISTS (SELECT 1 FROM spins s INNER JOIN rounds r ON r.id = s.round_id WHERE r.game_id = games.id)
                               THEN distribute_tickets
                               ELSE COALESCE($7::boolean, distribute_tickets)
                           END
                       WHERE id = $6 RETURNING *, EXISTS (SELECT 1 FROM spins s INNER JOIN rounds r ON r.id = s.round_id WHERE r.game_id = games.id) AS has_started`;

        const values = [title, start_datetime, end_datetime, max_capacity, description, gameId, distribute_tickets];

        const response = await pool.query(query, values);

        const data = response.rows[0];

        //console.log("Actualizado:", data.rows[0]);

        res.status(200).json(
            data
        )

    } catch (error) {
        return res.status(400).json({
            "error": "Error al actualizar juego."
        })
    }
}