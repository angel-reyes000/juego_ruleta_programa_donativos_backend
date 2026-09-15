import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { connectionDB } from './database/db.js';
import { getUsers, postUser, loginUser, auth } from './controllers/users/user.js'
import { getDataUser } from './controllers/users/dataUser.js';
import { paymentIntent, postDonation } from './controllers/users/donations.js';
import { getCurrentGame, getGames, postGames, updateGame } from './controllers/games/game.js';
import { deletePrize, getPrizes, postPrize } from './controllers/games/prize.js';
import { getCurrentRoundGame } from './controllers/games/round.js';
import { postSpin } from './controllers/games/spin.js';
import { deleteTicket, getTickets } from './controllers/games/ticket.js';

dotenv.config();

const app = express();

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: {
        origin: `${process.env.API_KEY_FRONTEND}`,
    },
})

app.use(cors())
app.use(express.json())


app.get("/api/users", getUsers);
//SIGNUP
app.post("/api/users", postUser);
//LOGIN
app.post("/api/loginUser", loginUser);

//MY ACCOUNT
app.get("/api/getDataUser",  auth, getDataUser);

//Intent payment
app.post("/api/paymentIntent", auth, paymentIntent);

//Create payment
app.post("/api/createPayment", auth, postDonation);

//Games
app.get("/api/getGames", auth, getGames);
app.get("/api/getCurrentGame", auth, getCurrentGame);
app.post("/api/postGames", auth, postGames);
app.put("/api/updateGame", auth, updateGame);

//Prizes
app.get("/api/getPrizes", auth, getPrizes);
app.post("/api/postPrize", auth, postPrize);
app.delete("/api/deletePrize", auth, deletePrize);

//Rounds
app.get("/api/getCurrentRoundGame", auth, getCurrentRoundGame);

//Spins
app.post("/api/postSpin", auth, postSpin);

//Tickets
app.get("/api/getTickets", auth, getTickets);
app.delete("/api/deleteTicket", auth, deleteTicket);


io.on("connection", (socket: Socket) => {

    socket.on("spin", (winning_number) => {
        console.log("Evento espin recibido", socket.id)

        io.emit("spin", winning_number);

        console.log("Evento spin enviado")

    })

})

httpServer.listen("4000", async () => {
    try{
        console.log("Servidor iniciado.✅")
        await connectionDB()
    } catch (error) {
        console.log("🟥Error al iniciar servidor: ", error)
    }
})