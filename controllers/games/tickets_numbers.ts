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

