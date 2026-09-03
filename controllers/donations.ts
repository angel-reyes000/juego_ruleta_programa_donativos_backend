import type { Request, Response } from "express"
import Stripe from "stripe"
import { pool } from "../database/db.js"

interface RequestAuth extends Request {
    user: {
        id: number
    }
}

export async function paymentIntent (req: Request, res: Response) {
    try {

        const token = req.headers.authorization?.split(" ")[1]

        if(!token) {
            return res.status(400).json({
                "error": "no token"
            })
        }
        
        const { amount, card_holder } = req.body;

        if (!amount || amount < 10) {
            return res.status(400).json({
                "error": "La cantidad debe ser mayor de 10MXN."
            })
        }

        if (!card_holder) {
            return res.status(400).json({
                "error": "Campo faltante: Nombre y apellido de tarjetahabiente."
            })
        }

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Multiplica por 100 porque recibe la cantidad en centavos ej. 10 pesos = 1000 centavos
            currency: "mxn",
            automatic_payment_methods: {
                "enabled": true
            }
        })

        return res.status(200).json({
            clientSecret: paymentIntent.client_secret
        })

    } catch (error) {
        console.log("Error in donations: ", error)
        return res.status(400).json({
            "error": `Error al procesar el pago.`
        })
    }
}

export async function createPayment (req: RequestAuth, res: Response) {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(400).json({
                "error": "no token"
            })
        }

        const { amount, card_holder } = req.body;

        if (!amount || amount < 10) {
            return res.status(400).json({
                "error": "La cantidad debe ser mayor de 10MXN."
            })
        }

        if (!card_holder) {
            return res.status(400).json({
                "error": "Campo faltante: Nombre y apellido de tarjetahabiente."
            })
        }

        const user_id = req.user?.id;
        
        const query = `INSERT INTO donations (user_id, amount, card_holder)
                        VALUES ($1, $2, $3) RETURNING *`;

        const values = [user_id, amount, card_holder];

        const data = await pool.query(query, values)

        const result = await data.rows[0]

        return res.status(200).json(
            result
        )
        
    } catch (error) {
        console.log("Error in createPayment", error)
        return res.status(400).json({
            "error": "Error al procesar el pago."
        })
    }
}