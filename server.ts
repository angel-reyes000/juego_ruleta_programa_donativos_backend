import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { connectionDB } from './database/db.js';
import { getUsers, postUser, loginUser, auth, getUsersWithDonation } from './controllers/users/user.js'
import { getDataUser } from './controllers/users/dataUser.js';
import { paymentIntent, postDonation } from './controllers/users/donations.js';
import { getCurrentGame, getGames, postGames, updateGame } from './controllers/games/game.js';
import { deletePrize, getPrizes, postPrize } from './controllers/games/prize.js';
import type { Prize } from './controllers/games/prize.js';
import { getCurrentRoundGame, getRounds } from './controllers/games/round.js';
import { postSpin } from './controllers/games/spin.js';
import { getTickets } from './controllers/games/ticket.js';
import { getGameWinners, getWinningTickets } from './controllers/games/winning_tickets.js';

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


//Users
app.get("/api/users", getUsers);
app.get("/api/getUsersWithDonation", auth, getUsersWithDonation);

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
app.get("/api/getRounds", auth, getRounds);
app.get("/api/getCurrentRoundGame", auth, getCurrentRoundGame);


//Spins
app.post("/api/postSpin", auth, postSpin);

//Tickets
app.get("/api/getTickets", auth, getTickets);

//Winning tickets
app.get("/api/getWinningTickets", auth, getWinningTickets);
app.get("/api/getGameWinners", auth, getGameWinners);



io.on("connection", (socket: Socket) => {

    socket.on("spin", (winning_number, dataRoulette, winners) => {
        //console.log("Evento espin recibido", socket.id)
        io.emit("spin", winning_number, dataRoulette, winners);
        //console.log("Evento spin enviado")

    })

    socket.on("prizesUpdated", (dataRoulette) => {

        io.emit("prizesUpdated", {
            items: dataRoulette.map((premio: Prize, index: number) => ({
                id: index + 1,
                label: `${index + 1}. ${premio.name}`,
            })),
            itemLabelFontSizeMax: 32,
        });
    })

    socket.on("updateRoundSpins", (number: number, spins: number, total_current_spins: number, dataRoulette) => {

        io.emit("updateRoundSpins", number, spins, total_current_spins, dataRoulette);
        
    });

    socket.on("latestResults", ( winningNumber: number, game_id: number, round_number: number, spin_number: number, prize_name: string) => {
        
        io.emit("latestResults", winningNumber, game_id, round_number, spin_number, prize_name);
        console.log("PRUEBA DE LO QUE MANDA LATESTRESULTS: ", winningNumber, game_id, round_number, spin_number, prize_name)

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