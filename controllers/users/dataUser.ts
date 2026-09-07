import type { Request, Response } from "express"

interface RequestAuth extends Request {
    user: string
}

export async function getDataUser (req: RequestAuth, res: Response) {
    try {
        const user = req.user;

        if (!user) {
            res.status(400).json({
                "error": "Usuario no encontrado"
            })
        }

        res.status(200).json(user)

    } catch (error) {
        res.status(400).json({
            "error": `Error en getDataUser: ${error}`
        })
    }
}