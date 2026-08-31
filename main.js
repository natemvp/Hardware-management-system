const express = require("express");
const path = require("path");
const mysql = require("mysql2");

const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const dbConnection = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "samuel_nat16",
    database: "hardware"
});

dbConnection.connect((err) => {
    if (err) {
        console.error("Error connecting to MySQL database:", err);
        return;
    }
    console.log("Connected to hardware MySQL database.");
});

app.get("/", (req, res) => {
    res.render("index");
});



app.get("/products", (req, res) => {
    dbConnection.query("SELECT * FROM products", (err, results) => {
        if (err) return res.status(500).send("Error fetching products");
        res.render("products", { products: results });
    });
});

app.get("/suppliers", (req, res) => {
    dbConnection.query("SELECT * FROM suppliers", (err, results) => {
        if (err) return res.status(500).send("Error fetching suppliers");
        res.render("suppliers", { suppliers: results });
    });
});

app.get("/customers", (req, res) => {
    dbConnection.query("SELECT * FROM customers", (err, results) => {
        if (err) return res.status(500).send("Error fetching customers");
        res.render("customers", { customers: results });
    });
});

app.get("/employees", (req, res) => {
    dbConnection.query("SELECT * FROM employees", (err, results) => {
        if (err) return res.status(500).send("Error fetching employees");
        res.render("employees", { employees: results });
    });
});

app.get("/sales", (req, res) => {

    const query = `
        SELECT s.salesid, s.salesdate, s.quantitysold, 
               p.productname, c.customer_name 
        FROM sales s
        LEFT JOIN products p ON s.product_id = p.product_id
        LEFT JOIN customers c ON s.customers_id = c.customers_id
    `;
    dbConnection.query(query, (err, results) => {
        if (err) return res.status(500).send("Error fetching sales");
        res.render("sales", { sales: results });
    });
});


app.post("/add-product", (req, res) => {
    const { product_id, productname, unitprice, stockquantity } = req.body;
    const query = "INSERT INTO products (product_id, productname, unitprice, stockquantity) VALUES (?, ?, ?, ?)";
    dbConnection.query(query, [product_id, productname, unitprice, stockquantity], (err) => {
        if (err) return res.status(500).send("Error adding product");
        res.redirect("/products");
    });
});

app.post("/add-supplier", (req, res) => {
    const { SupplierID, SupplierName, PhoneNumber, Address } = req.body;
    const query = "INSERT INTO suppliers (SupplierID, SupplierName, PhoneNumber, Address) VALUES (?, ?, ?, ?)";
    dbConnection.query(query, [SupplierID, SupplierName, PhoneNumber, Address], (err) => {
        if (err) return res.status(500).send("Error adding supplier");
        res.redirect("/suppliers");
    });
});

app.post("/add-customer", (req, res) => {
    const { customers_id, customer_name, contact, address } = req.body;
    const query = "INSERT INTO customers (customers_id, customer_name, contact, address) VALUES (?, ?, ?, ?)";
    dbConnection.query(query, [customers_id, customer_name, contact, address], (err) => {
        if (err) return res.status(500).send("Error adding customer");
        res.redirect("/customers");
    });
});

app.post("/add-employee", (req, res) => {
    const { EmployeeID, FirstName, PhoneNumber, Position } = req.body;
    const query = "INSERT INTO employees (EmployeeID, FirstName, PhoneNumber, Position) VALUES (?, ?, ?, ?)";
    dbConnection.query(query, [EmployeeID, FirstName, PhoneNumber, Position], (err) => {
        if (err) return res.status(500).send("Error adding employee");
        res.redirect("/employees");
    });
});

app.post("/add-sale", (req, res) => {
    const { salesid, salesdate, quantitysold, product_id, customers_id } = req.body;
    const query = "INSERT INTO sales (salesid, salesdate, quantitysold, product_id, customers_id) VALUES (?, ?, ?, ?, ?)";
    dbConnection.query(query, [salesid, salesdate, quantitysold, product_id, customers_id], (err) => {
        if (err) return res.status(500).send("Error adding sale");
        res.redirect("/sales");
    });
});

// 404 Route Handler
app.use((req, res) => {
    res.status(404).render("404");
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
});