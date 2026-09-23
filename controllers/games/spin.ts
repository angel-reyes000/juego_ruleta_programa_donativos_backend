import type { Request, Response } from "express";
import { randomInt } from "node:crypto";
import { pool } from "../../database/db.js";
import { reassignActiveTicketNumbers } from "./tickets_numbers.js";
import { fillGameCapacity } from "./ticket.js";

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
    const client = await pool.connect();

    try {

        const roleUser = req.user.role;

        if (roleUser !== 'admin') {
            return res.status(400).json({
                "error": "No tienes permitido realizar giros."
            })
        }

        const round_id = Number(req.body.round_id);

        if (!Number.isInteger(round_id)) {
            return res.status(400).json({
                "error": "Ronda no valida."
            })
        }

        await client.query("BEGIN");

        const dataRoundRef = await client.query(`SELECT game_id FROM rounds WHERE id = $1`, [round_id]);

        if (dataRoundRef.rows.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                "error": "Ronda no encontrada."
            })
        }

        const game_id: number = dataRoundRef.rows[0].game_id;

        // Serializa los giros del mismo juego: evita dos giros simultaneos (doble clic, dos admins).
        await client.query(`SELECT id FROM games WHERE id = $1 FOR UPDATE`, [game_id]);

        const dataRounds = await client.query(
            `SELECT id, number, spins FROM rounds WHERE game_id = $1 ORDER BY number ASC`,
            [game_id]
        );
        const rounds: Array<{ id: number, number: number, spins: number }> = dataRounds.rows;

        const dataCounts = await client.query(
            `SELECT round_id, COUNT(*)::int AS total FROM spins WHERE round_id = ANY($1::int[]) GROUP BY round_id`,
            [rounds.map((round) => round.id)]
        );
        const counts = new Map<number, number>(
            dataCounts.rows.map((row: { round_id: number, total: number }) => [row.round_id, row.total] as [number, number])
        );

        // La ronda actual la decide el servidor: la primera que aun tiene giros pendientes.
        const currentRound = rounds.find((round) => (counts.get(round.id) ?? 0) < round.spins);

        if (!currentRound) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                "error": ["El juego a finalizado.", "Limite de giros alcanzado"]
            });
        }

        const doneSpins = counts.get(currentRound.id) ?? 0;
        const totalGameSpins = Array.from(counts.values()).reduce((sum, total) => sum + total, 0);

        let extra_tickets = { added: 0, before: 0, after: 0 };

        if (totalGameSpins === 0) {
            const dataTickets = await client.query(`SELECT COUNT(*)::int AS total FROM tickets WHERE game_id = $1`, [game_id]);

            if (dataTickets.rows[0].total === 0) {
                await client.query("ROLLBACK");
                return res.status(400).json({
                    "error": "No hay tickets participantes para iniciar el sorteo."
                })
            }

            // Primer giro: se cierra el cupo, se completa la capacidad maxima repartiendo tickets de forma
            // equitativa (si ya estaba llena no cambia nada) y se reparten los numeros de forma pareja.
            extra_tickets = await fillGameCapacity(client, game_id);
            await reassignActiveTicketNumbers(client, game_id);
        }

        // El numero ganador no se repite dentro de la misma ronda.
        const dataUsed = await client.query(`SELECT winning_number FROM spins WHERE round_id = $1`, [currentRound.id]);
        const used = new Set<number>(dataUsed.rows.map((row: { winning_number: number }) => row.winning_number));
        const available = Array.from({ length: 10 }, (_, index) => index + 1).filter((number) => !used.has(number));

        if (available.length === 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                "error": "No hay numeros disponibles en la ronda."
            })
        }

        const winning_number = available[randomInt(available.length)]!;
        console.log("Numero ganador: ", winning_number)

        const dataSpin = await client.query(
            `INSERT INTO spins (winning_number, round_id) VALUES ($1, $2) RETURNING *`,
            [winning_number, currentRound.id]
        );
        const spin = dataSpin.rows[0];
        const spin_number = doneSpins + 1;

        const dataPrize = await client.query(
            `SELECT name FROM prizes WHERE game_id = $1 AND round = $2 AND roulette_number = $3 LIMIT 1`,
            [game_id, currentRound.number, winning_number]
        );
        const prize_name: string | null = dataPrize.rows.length === 0 ? null : dataPrize.rows[0].name;

        await client.query(
            `INSERT INTO winning_tickets (winning_number, game_id, round_number, spin_number, prize_name)
             VALUES ($1, $2, $3, $4, $5)`,
            [winning_number, game_id, currentRound.number, spin_number, prize_name]
        );

        // Todas las rondas: si el usuario tiene un ticket con el numero ganador queda registrado como ganador
        // de este giro (un solo registro por usuario, con su primer ticket coincidente). No se le resta ningun ticket:
        // en las rondas 1-4 el usuario avanza con todos sus tickets y en las rondas 4 y 5 ademas recibe el premio.
        let winners: Array<{ user_id: number, display_name: string }> = [];
        {
            const dataWinners = await client.query(
                `INSERT INTO game_winners (game_id, user_id, ticket_id, round_number, spin_number, winning_number, prize_name)
                 SELECT t.game_id, t.user_id, t.id, $2, $3, $4, $5
                 FROM tickets t
                 WHERE t.game_id = $1 AND t.status = 'active'
                 AND t.id IN (
                     SELECT MIN(t2.id)
                     FROM tickets t2
                     INNER JOIN tickets_numbers tn ON tn.ticket_id = t2.id
                     WHERE t2.game_id = $1 AND t2.status = 'active' AND tn.number = $4
                     GROUP BY t2.user_id
                 )
                 RETURNING user_id`,
                [game_id, currentRound.number, spin_number, winning_number, prize_name]
            );

            // Solo las rondas 4 y 5 se muestran en la animacion (en las primeras habria cientos de nombres).
            if (currentRound.number >= 4) {
                const user_ids: number[] = Array.from(new Set<number>(dataWinners.rows.map((row: { user_id: number }) => row.user_id)));

                const dataUsers = await client.query(
                    `SELECT id, name, last_name FROM users WHERE id = ANY($1::int[]) ORDER BY id`,
                    [user_ids]
                );

                winners = dataUsers.rows.map((user: { id: number, name: string, last_name: string }) => ({
                    user_id: user.id,
                    display_name: `${user.name} ${user.last_name.charAt(0)}.`,
                }));
            }
        }

        const round_completed = spin_number === currentRound.spins;

        // Ronda 5: solo hay 9 giros reales. Si con este giro se completa la ronda y queda
        // exactamente un numero sin salir, no tiene caso girar por el: se le asigna el premio
        // automaticamente al ticket que lo tenga, igual que un giro normal pero sin animacion de por medio.
        let auto_assigned: {
            id: number
            winning_number: number
            round_id: number
            game_id: number
            round_number: number
            spin_number: number
            prize_name: string | null
            winners: Array<{ user_id: number, display_name: string }>
        } | null = null;

        if (round_completed && currentRound.number === 5) {
            const dataUsedAfter = await client.query(`SELECT winning_number FROM spins WHERE round_id = $1`, [currentRound.id]);
            const usedAfter = new Set<number>(dataUsedAfter.rows.map((row: { winning_number: number }) => row.winning_number));
            const remaining = Array.from({ length: 10 }, (_, index) => index + 1).filter((number) => !usedAfter.has(number));

            if (remaining.length === 1) {
                const auto_winning_number = remaining[0]!;
                const auto_spin_number = spin_number + 1;

                const dataAutoSpin = await client.query(
                    `INSERT INTO spins (winning_number, round_id) VALUES ($1, $2) RETURNING *`,
                    [auto_winning_number, currentRound.id]
                );
                const autoSpin = dataAutoSpin.rows[0];

                const dataAutoPrize = await client.query(
                    `SELECT name FROM prizes WHERE game_id = $1 AND round = $2 AND roulette_number = $3 LIMIT 1`,
                    [game_id, currentRound.number, auto_winning_number]
                );
                const auto_prize_name: string | null = dataAutoPrize.rows.length === 0 ? null : dataAutoPrize.rows[0].name;

                await client.query(
                    `INSERT INTO winning_tickets (winning_number, game_id, round_number, spin_number, prize_name)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [auto_winning_number, game_id, currentRound.number, auto_spin_number, auto_prize_name]
                );

                const dataAutoWinners = await client.query(
                    `INSERT INTO game_winners (game_id, user_id, ticket_id, round_number, spin_number, winning_number, prize_name)
                     SELECT t.game_id, t.user_id, t.id, $2, $3, $4, $5
                     FROM tickets t
                     WHERE t.game_id = $1 AND t.status = 'active'
                     AND t.id IN (
                         SELECT MIN(t2.id)
                         FROM tickets t2
                         INNER JOIN tickets_numbers tn ON tn.ticket_id = t2.id
                         WHERE t2.game_id = $1 AND t2.status = 'active' AND tn.number = $4
                         GROUP BY t2.user_id
                     )
                     RETURNING user_id`,
                    [game_id, currentRound.number, auto_spin_number, auto_winning_number, auto_prize_name]
                );

                const auto_user_ids: number[] = Array.from(new Set<number>(dataAutoWinners.rows.map((row: { user_id: number }) => row.user_id)));

                const dataAutoUsers = await client.query(
                    `SELECT id, name, last_name FROM users WHERE id = ANY($1::int[]) ORDER BY id`,
                    [auto_user_ids]
                );

                auto_assigned = {
                    ...autoSpin,
                    game_id: game_id,
                    round_number: currentRound.number,
                    spin_number: auto_spin_number,
                    prize_name: auto_prize_name,
                    winners: dataAutoUsers.rows.map((user: { id: number, name: string, last_name: string }) => ({
                        user_id: user.id,
                        display_name: `${user.name} ${user.last_name.charAt(0)}.`,
                    })),
                };
            }
        }

        // Fin de ronda (1-4): avanzan los usuarios que ganaron algun giro de la ronda (con todos sus tickets);
        // los tickets de los demas usuarios se eliminan. A los tickets que siguen se les reasigna numero al azar.
        if (round_completed && currentRound.number < 5) {
            await client.query(
                `UPDATE tickets t SET status = 'eliminated', eliminated_round = $2
                 WHERE t.game_id = $1 AND t.status = 'active'
                 AND NOT EXISTS (
                     SELECT 1 FROM game_winners gw
                     WHERE gw.user_id = t.user_id AND gw.game_id = t.game_id AND gw.round_number = $2
                 )`,
                [game_id, currentRound.number]
            );

            await reassignActiveTicketNumbers(client, game_id);
        }

        const dataActive = await client.query(
            `SELECT COUNT(*)::int AS total FROM tickets WHERE game_id = $1 AND status = 'active'`,
            [game_id]
        );

        await client.query("COMMIT");

        return res.status(200).json({
            ...spin,
            game_id: game_id,
            round_number: currentRound.number,
            spin_number: spin_number,
            prize_name: prize_name,
            round_completed: round_completed,
            active_tickets: dataActive.rows[0].total,
            winners: winners,
            auto_assigned: auto_assigned,
            extra_tickets: extra_tickets,
        })

    } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        console.log("Error in postSpin: ", error)
        return res.status(400).json({
            "error": "Error al realizar tu giro."
        })
    } finally {
        client.release();
    }
}
