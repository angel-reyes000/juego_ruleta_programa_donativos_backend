import type { Request, Response } from "express"
import Stripe from "stripe"
import { pool } from "../../database/db.js"
import { activeGameHasStarted, postTickets } from "../games/ticket.js"

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
        
        const { amount, card_holder, check_box } = req.body;

        if (!amount || amount < 100) {
            return res.status(400).json({
                "error": "La cantidad debe ser mayor de $100MXN."
            })
        }

        if (!amount || amount > 10000) {
            return res.status(400).json({
                "error": "Para donar cantidades superiores a $10,000 MXN contactenos."
            })
        }

        if (!card_holder) {
            return res.status(400).json({
                "error": "Campo faltante: Nombre y apellido de tarjetahabiente."
            })
        }

        if (!check_box) {
            return res.status(400).json({
                "error": "Debes aceptar terminos y condiciones."
            })
        }

        let total_amount = amount;
        while (true) {
            total_amount -= 100;
            if (total_amount < 0) {
                return res.status(400).json({
                    "error": "Solo se aceptan cantidades en múltiplos de $100 (ej. $100, $200, $300)."
                })
            } else if (total_amount === 0) {
                break
            } else {
                continue
            }
        }

        if (await activeGameHasStarted()) {
            return res.status(400).json({
                "error": "El sorteo ya inicio, ya no se aceptan donativos para este juego."
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

export async function postDonation (req: RequestAuth, res: Response) {
    try {
        const token = req.headers.authorization?.split(" ")[1];

        if (!token) {
            return res.status(400).json({
                "error": "no token"
            })
        }

        const { amount, card_holder } = req.body;

        if (!amount || amount < 100) {
            return res.status(400).json({
                "error": "La cantidad debe ser mayor de 100MXN."
            })
        }

        if (!amount || amount > 10000) {
            return res.status(400).json({
                "error": "Para donar cantidades superiores a $10,000 MXN contactenos."
            })
        }

        if (!card_holder) {
            return res.status(400).json({
                "error": "Campo faltante: Nombre y apellido de tarjetahabiente."
            })
        }

        let total_amount = amount;
        let total_tickets = 0
        while (true) {
            total_amount -= 100;
            total_tickets += 1;
            if (total_amount < 0) {
                return res.status(400).json({
                    "error": "Solo se aceptan cantidades en múltiplos de $100 (ej. $100, $200, $300)."
                })
            } else if (total_amount === 0) {
                break
            } else {
                continue
            }
        }

        if (await activeGameHasStarted()) {
            return res.status(400).json({
                "error": "El sorteo ya inicio, ya no se aceptan donativos para este juego."
            })
        }

        const user_id = req.user?.id;
        
        const query = `INSERT INTO donations (user_id, amount, card_holder)
                        VALUES ($1, $2, $3) RETURNING *`;

        const values = [user_id, amount, card_holder];

        const data = await pool.query(query, values)

        const result = await data.rows[0];

        const donation_id = result.id;

        const ticketMessage  = await postTickets(user_id, donation_id, total_tickets);

        return res.status(200).json({
            "message": ticketMessage
        })
        
    } catch (error) {
        console.log("Error in createPayment", error)
        return res.status(400).json({
            "error": "Error al procesar el pago."
        })
    }
}