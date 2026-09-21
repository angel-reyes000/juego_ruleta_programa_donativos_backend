import { randomInt } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../../database/db.js";

export async function postTicketNumber (ticket_id: number) {
    try {

        if (!ticket_id) {
            return "Error al generar un numero en tu ticket."
        }

        const query = `INSERT INTO tickets_numbers (number, ticket_id)
                       VALUES ($1, $2) RETURNING *`;

        const number_random = Math.floor(Math.random() * 10) + 1;

        const values = [number_random, ticket_id];

        const response = await pool.query(query, values);

        const data = response.rows[0];
        //console.log("Dato del ticket", data);

        return "Numero de ticket creado correctamente."

    } catch (error) {
        console.log("Error in postTicketNumber: ", error)
    }
}

// Reasigna al azar el número (1-10) de todos los tickets activos del juego.
// Se baraja la lista y se reparte en rotación, así cada número queda con la misma
// cantidad de tickets (500 c/u con 5,000 tickets) y con 10 tickets cada uno recibe un número distinto.
// Debe ejecutarse dentro de la transacción del cliente recibido.
export async function reassignActiveTicketNumbers (client: PoolClient, game_id: number) {
    const response = await client.query(
        `SELECT id FROM tickets WHERE game_id = $1 AND status = 'active' ORDER BY id`,
        [game_id]
    );

    const ticket_ids: number[] = response.rows.map((row: { id: number }) => row.id);

    for (let i = ticket_ids.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [ticket_ids[i], ticket_ids[j]] = [ticket_ids[j]!, ticket_ids[i]!];
    }

    const offset = randomInt(10);
    const numbers = ticket_ids.map((_, index) => ((index + offset) % 10) + 1);

    await client.query(`DELETE FROM tickets_numbers WHERE ticket_id = ANY($1::int[])`, [ticket_ids]);

    await client.query(
        `INSERT INTO tickets_numbers (ticket_id, number)
         SELECT * FROM unnest($1::int[], $2::int[])`,
        [ticket_ids, numbers]
    );

    return ticket_ids.length;
}
