import  { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config()

export const pool = new Pool({
    host: process.env.HOST,
    port: Number(process.env.PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.USER,
    password: process.env.PASSWORD,
})

export async function connectionDB() {
    try{
        await pool.connect()
        console.log("Conectado a DB.✅")
    } catch (error) {
        console.log("🟥Error al conectarse con la DB: ", error)
    }
}