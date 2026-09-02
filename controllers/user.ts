import { pool } from '../database/db.js';
import type { NextFunction, Request, Response } from 'express'; 
import bcrypt from 'bcrypt';
import jsonwebtoken, { type JwtPayload } from 'jsonwebtoken'; 
import dotenv from 'dotenv';

dotenv.config();

interface User <T> {
    name: T
    last_name: T 
    email: T
    password: T 
    phone_number: T
}

interface RequestAuth extends Request {
    user: string | JwtPayload
}

export async function getUsers (req: Request, res: Response) {
    try {
        const query = "SELECT * FROM users"

        const response = await pool.query(query)

        return res.json(
            response.rows
        )

    } catch (error) {
        console.log("Error in getUsers backend: ", error)
        return res.json({
            "Error": error
        })
    }
}

export async function postUser (req: Request, res: Response) {
    try {

        const { name, last_name, email, password, phone_number }: User<string> = req.body;

        const repeatUserQuery = "SELECT * FROM users WHERE email = $1";

        const repeatUserData = await pool.query(repeatUserQuery, [email, ])

        if (repeatUserData.rowCount! > 0) {
            return res.status(400).json({
                "error": "Usuario ya existente."
            })
        }

        if (!name || !last_name || name.length > 30 || last_name.length > 30) {
            return res.status(400).json({
                "error": "Valores faltantes: nombre(max. 30 caracteres) y/o apellido(max. 30 caracteres)"
            })
        }

        if (!email || !password || email.length > 50 || password.length > 15) {
            return res.status(400).json({
                "error": "Valores faltantes: email(max. 50 caracteres) y/o contraseña(max. 15 caracteres)"
            })
        }

        if (phone_number.length > 10 || phone_number.length < 10) {
            return res.status(400).json({
                "error": "Numero celular debe tener 10 caracteres"
            })
        }

        const query = `INSERT INTO users (name, last_name, email, password, phone_number)
                        VALUES ($1, $2, $3, $4, $5) RETURNING *`;

        const passwordHashed = await bcrypt.hash(password, 12);

        const values = [name, last_name, email, passwordHashed, phone_number];

        const response = await pool.query(query, values);

        console.log("Usuario creado: ", response.rows[0].name)
        return res.status(201).json({
            "Usuario creado: ": response.rows[0].name
        })

    } catch (error) {
        console.log("Error in postUser backend: ", error)
        return res.status(400).json({
            "Error": error
        })
    }
}

export async function loginUser (req: Request, res: Response) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            console.log("No proporciono gmail o contraseña")
            return res.status(400).json({
                "error": "No proporciono gmail o contraseña"
            })
        }

        const query = "SELECT * FROM users WHERE email = $1";

        const data = await pool.query(query, [email, ]);

        if (data.rowCount === 0) {
            return res.status(400).json({
                "error": "Usuario no existente",
            })
        }

        const user = data.rows[0]

        const comparePassword = await bcrypt.compare(password, user.password)

        if (!comparePassword) {
            return res.status(400).json({
                "error": "Contraseña incorrecta",
            })
        }

        const token = jsonwebtoken.sign(
            {
                id: user.id,
                name: user.name,
                last_name: user.last_name,
                email: user.email,
                phone_number: user.phone_number,
                created_at: user.created_at,
            },
            process.env.JWT_SECRET!,
            {
                "expiresIn": "1h"
            }
        )

        return res.status(200).json({
            "token": token
        })

    } catch (error) {
        console.log("Error in loginUser backend: ", error)
        return res.status(400).json({
            "error": error
        })
    }
}

export async function auth (req: RequestAuth, res: Response, next: NextFunction) {
    try {
        const token: string | undefined = req.headers.authorization?.split(" ")[1];

        console.log(token)

        if (!token) {
            res.status(400).json({
                "error": "No token"
            })
        }

        const decoded = jsonwebtoken.verify(token!, process.env.JWT_SECRET!)

        req.user = decoded;
        next()

    } catch (error) {
        console.log("Error in loginUser backend: ", error)
        return res.status(400).json({
            "error": error
        })
    }
}
