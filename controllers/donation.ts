import type { Request, Response } from "express"
import Stripe from "stripe"

export async function donation (req: Request, res: Response) {
    try {
        
        const { quantity } = req.body;

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: quantity * 100, // Multiplica por 100 porque recibe la cantidad en centavos ej. 10 pesos = 1000 centavos
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
            "error": `Error: ${error}`
        })
    }
}