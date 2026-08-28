import express from 'express';
import cors from 'cors';
import { connectionDB } from './database/db.js';
import { getUsers, postUser, loginUser } from './controllers/user.js'

const app = express()

app.use(cors())
app.use(express.json())


app.get("/api/users", getUsers)
app.post("/api/users", postUser)

app.post("/api/loginUser", loginUser)


app.listen("4000", async () => {
    try{
        console.log("Servidor iniciado.✅")
        await connectionDB()
    } catch (error) {
        console.log("🟥Error al iniciar servidor: ", error)
    }
})