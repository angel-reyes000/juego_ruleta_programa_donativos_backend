import express from 'express';
import cors from 'cors';
import { connectionDB } from './database/db.js';
import { getUsers, postUser, loginUser, auth } from './controllers/users/user.js'
import { getDataUser } from './controllers/users/dataUser.js';
import { paymentIntent, postDonation } from './controllers/users/donations.js';
import { getGames, postGames, updateGame } from './controllers/games/game.js';
import { deletePrize, getPrizes, postPrize } from './controllers/games/prize.js';

const app = express()

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
app.post("/api/postGames", auth, postGames);
app.put("/api/updateGame", auth, updateGame);

//Prizes
app.get("/api/getPrizes", auth, getPrizes);
app.post("/api/postPrize", auth, postPrize);
app.delete("/api/deletePrize", auth, deletePrize);

app.listen("4000", async () => {
    try{
        console.log("Servidor iniciado.✅")
        await connectionDB()
    } catch (error) {
        console.log("🟥Error al iniciar servidor: ", error)
    }
})