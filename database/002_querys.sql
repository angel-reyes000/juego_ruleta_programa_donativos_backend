/*
To create a admin user, first create a normal user from the app,
after, use the 'UPDATE' query to actualizate role to 'admin'
*/

--Consulta para obtener el monto vendido de cada vendedor
SELECT s.name AS vendedor, d.card_holder, SUM(d.amount) AS total
FROM donations d 
INNER JOIN salesperson s ON s.id = d.salesperson_id
GROUP BY vendedor, d.card_holder;