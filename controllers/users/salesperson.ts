import type { Request, Response } from "express";
import { pool } from '../../database/db.js';

export async function getSalesPerson (req: Request, res: Response) {
    try {

        const query = `SELECT * FROM salesperson`;

        const response = await pool.query(query)

        const data = response.rows
        console.log(data)

        return res.status(200).json(data)

    } catch (error) {
        console.log("Error in getSalesPerson: ", error)
        return res.status(400).json({
            "message": "Error al obtener vendedores."
        })
    }
}