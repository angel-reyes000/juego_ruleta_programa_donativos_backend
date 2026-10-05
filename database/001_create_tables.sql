CREATE TABLE users (
	id SERIAL PRIMARY KEY,
	name VARCHAR(30) NOT NULL,
	last_name VARCHAR(30) NOT NULL,
	role VARCHAR(10) NOT NULL DEFAULT 'user',
	email VARCHAR(50) UNIQUE NOT NULL,
	password TEXT NOT NULL,
	phone_number VARCHAR(10) NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE donations (
	id SERIAL PRIMARY KEY,
	user_id INT NOT NULL,
	amount INT NOT NULL,
	card_holder TEXT NOT NULL,
	salesperson_id INT, 
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id),
	FOREIGN KEY (salesperson_id) REFERENCES salesperson(id)
);

CREATE TABLE games (
	id SERIAL PRIMARY KEY,
	title VARCHAR(100) NOT NULL,
	start_datetime TIMESTAMP NOT NULL,
	end_datetime TIMESTAMP NOT NULL,
	max_capacity INT NOT NULL DEFAULT 5000,
	description TEXT NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prizes (
	id SERIAL PRIMARY KEY,
	name VARCHAR(100) NOT NULL,
	game_id INT NOT NULL,
	type VARCHAR(100) NOT NULL,
	value INT NOT NULL,
	round INT NOT NULL,
	roulette_number INT NOT NULL,
	FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE rounds (
	id SERIAL PRIMARY KEY,
	game_id INT NOT NULL,
	number INT NOT NULL,
	spins INT NOT NULL,
	FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE tickets (
	id SERIAL PRIMARY KEY,
	user_id INT NOT NULL,
	game_id INT NOT NULL,
	donation_id INT NOT NULL,
	status VARCHAR(10) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated')),
	eliminated_round INT,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (user_id) REFERENCES users(id),
	FOREIGN KEY (donation_id) REFERENCES donations(id),
	FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE tickets_numbers (
	id SERIAL PRIMARY KEY,
	ticket_id INT NOT NULL,
	number INT NOT NULL,
	FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
);

CREATE TABLE spins (
	id SERIAL PRIMARY KEY,
	round_id INT NOT NULL,
	winning_number INT NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (round_id) REFERENCES rounds(id)
);

--Impide que un número salga dos veces en la misma ronda.
CREATE UNIQUE INDEX spins_round_winning_number_unique ON spins (round_id, winning_number);

CREATE TABLE winning_tickets (
	id SERIAL PRIMARY KEY,
	winning_number INT NOT NULL,
	game_id INT NOT NULL,
	round_number INT NOT NULL,
	spin_number INT NOT NULL,
	prize_name VARCHAR(100),
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (game_id) REFERENCES games(id)
);

CREATE TABLE game_winners (
	id SERIAL PRIMARY KEY,
	game_id INT NOT NULL,
	user_id INT NOT NULL,
	ticket_id INT NOT NULL,
	round_number INT NOT NULL,
	spin_number INT NOT NULL,
	winning_number INT NOT NULL,
	prize_name VARCHAR(100),
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (game_id) REFERENCES games(id),
	FOREIGN KEY (user_id) REFERENCES users(id),
	FOREIGN KEY (ticket_id) REFERENCES tickets(id)
);

CREATE TABLE salesperson (
	id SERIAL PRIMARY KEY,
	name VARCHAR(50) NOT NULL,
	last_name VARCHAR(50) NOT NULL,
	phone_number VARCHAR(50) NOT NULL,
	email VARCHAR(50) NOT NULL,
	created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);