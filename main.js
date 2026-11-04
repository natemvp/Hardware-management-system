const express = require("express");
const path = require("path");
const mysql = require("mysql2");
const session = require("express-session");
const app = express();
const port = 3000;

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: "hardware_hub_secret_key_123",
    resave: false,
    saveUninitialized: false,
  })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const dbConnection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "samuel_nat16",
  database: "hardware",
});

dbConnection.connect((err) => {
  if (err) {
    console.error("Error connecting to MySQL database:", err);
    return;
  }
  console.log("Connected to hardware MySQL database.");
});

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

const privateRoutes = [
  "/dashboard",
  "/suppliers",
  "/customers",
  "/employees",
  "/sales",
  "/products",
];

app.use((req, res, next) => {
  if (!req.session.cart) {
    req.session.cart = [];
  }

  if (privateRoutes.includes(req.url)) {
    if (!req.session.user) {
      return res.redirect("/login");
    }
  }

  res.locals.cart = req.session.cart;
  res.locals.user = req.session.user || null;
  res.locals.isLoggedIn = !!req.session.user;
  next();
});

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/contact", (req, res) => {
  res.render("contact");
});

app.get("/shop", (req, res) => {
  dbConnection.query(
    "SELECT * FROM products WHERE stockquantity > 0",
    (err, results) => {
      if (err) {
        console.error("Error fetching shop products:", err);
        return res.status(500).send("Error fetching shop products");
      }
      res.render("shop", { products: results });
    }
  );
});

app.post("/add-to-cart", (req, res) => {
  const { product_id, quantity } = req.body;
  const qty = parseInt(quantity, 10) || 1;

  dbConnection.query(
    "SELECT * FROM products WHERE product_id = ?",
    [product_id],
    (err, results) => {
      if (err || results.length === 0) {
        return res.status(404).send("Product not found");
      }

      const product = results[0];
      const existingItem = req.session.cart.find(
        (item) => item.product_id == product_id
      );

      if (existingItem) {
        existingItem.quantity += qty;
      } else {
        req.session.cart.push({
          product_id: product.product_id,
          productname: product.productname,
          unitprice: product.unitprice,
          quantity: qty,
        });
      }

      res.redirect("/shop");
    }
  );
});

app.get("/cart", (req, res) => {
  const cart = req.session.cart || [];
  const grandTotal = cart.reduce(
    (sum, item) => sum + item.unitprice * item.quantity,
    0
  );
  res.render("cart", { cart, grandTotal });
});

app.post("/remove-from-cart", (req, res) => {
  const { product_id } = req.body;
  req.session.cart = req.session.cart.filter(
    (item) => item.product_id != product_id
  );
  res.redirect("/cart");
});

// --- ROBUST SEQUENTIAL CHECKOUT ROUTE WITH TRANSACTIONS ---
app.post("/checkout", (req, res) => {
  const cart = req.session.cart || [];

  if (cart.length === 0) {
    return res.redirect("/cart");
  }

  const customer_id = req.body.customer_id || 1;

  dbConnection.beginTransaction((err) => {
    if (err) {
      console.error("Transaction start error:", err);
      return res.status(500).send("Checkout failed to start.");
    }

    // Helper function to process items one by one sequentially
    function processItem(index) {
      if (index === cart.length) {
        // All items processed successfully, commit transaction
        return dbConnection.commit((commitErr) => {
          if (commitErr) {
            return dbConnection.rollback(() => {
              console.error("Commit error:", commitErr);
              res.status(500).send("Checkout commit failed.");
            });
          }

          req.session.cart = [];
          return res.render("checkout-success", {
            message: "Order placed successfully! Stock updated.",
          });
        });
      }

      const item = cart[index];

      // Step 1: Get the next salesid automatically to prevent primary key errors
      dbConnection.query("SELECT IFNULL(MAX(salesid), 0) + 1 AS nextId FROM sales", (err, idResult) => {
        if (err) {
          return dbConnection.rollback(() => {
            console.error("Error generating sales ID:", err);
            res.status(500).send("Error generating sale ID.");
          });
        }

        const nextSalesId = idResult[0].nextId;

        // Step 2: Insert the sale record
        const insertSale =
          "INSERT INTO sales (salesid, salesdate, quantitysold, product_id, customers_id) VALUES (?, NOW(), ?, ?, ?)";

        dbConnection.query(
          insertSale,
          [nextSalesId, item.quantity, item.product_id, customer_id],
          (insertErr) => {
            if (insertErr) {
              return dbConnection.rollback(() => {
                console.error("Sales Insert Error:", insertErr);
                res.status(500).send("Error recording sale. Rolling back.");
              });
            }

            // Step 3: Reduce stock quantity in products table
            const updateStock =
              "UPDATE products SET stockquantity = stockquantity - ? WHERE product_id = ?";

            dbConnection.query(
              updateStock,
              [item.quantity, item.product_id],
              (updateErr) => {
                if (updateErr) {
                  return dbConnection.rollback(() => {
                    console.error("Stock Update Error:", updateErr);
                    res.status(500).send("Error updating stock. Rolling back.");
                  });
                }

                // Move to the next item in the cart
                processItem(index + 1);
              }
            );
          }
        );
      });
    }

    // Start processing from the first item
    processItem(0);
  });
});
// -------------------------------------------------------------

app.get("/login", (req, res) => {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  res.render("login", { error: null });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).render("login", {
      error: "Enter your email address and password to continue.",
    });
  }

  const sqlQuery = "SELECT * FROM users WHERE email = ? AND password = ?";
  dbConnection.query(sqlQuery, [email, password], (err, results) => {
    if (err) {
      console.error("Authentication DB error:", err);
      return res.status(500).send("Internal server error during login.");
    }
    if (results.length > 0) {
      req.session.user = results[0];
      return res.redirect("/dashboard");
    } else {
      return res.render("login", { error: "Invalid email or password." });
    }
  });
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error("Error destroying session:", err);
    res.redirect("/login");
  });
});

app.get("/dashboard", requireAuth, (req, res) => {
  res.render("dashboard", { user: req.session.user });
});

app.get("/products", requireAuth, (req, res) => {
  dbConnection.query("SELECT * FROM products", (err, results) => {
    if (err) return res.status(500).send("Error fetching products");
    res.render("products", { products: results, user: req.session.user });
  });
});

app.get("/suppliers", requireAuth, (req, res) => {
  dbConnection.query("SELECT * FROM suppliers", (err, results) => {
    if (err) return res.status(500).send("Error fetching suppliers");
    res.render("suppliers", { suppliers: results, user: req.session.user });
  });
});

app.get("/customers", requireAuth, (req, res) => {
  dbConnection.query("SELECT * FROM customers", (err, results) => {
    if (err) return res.status(500).send("Error fetching customers");
    res.render("customers", { customers: results, user: req.session.user });
  });
});

app.get("/employees", requireAuth, (req, res) => {
  dbConnection.query("SELECT * FROM employees", (err, results) => {
    if (err) return res.status(500).send("Error fetching employees");
    res.render("employees", { employees: results, user: req.session.user });
  });
});

app.get("/sales", requireAuth, (req, res) => {
  const query =
    "SELECT s.salesid, s.salesdate, s.quantitysold, p.productname, c.customer_name FROM sales s LEFT JOIN products p ON s.product_id = p.product_id LEFT JOIN customers c ON s.customers_id = c.customers_id";
  dbConnection.query(query, (err, results) => {
    if (err) return res.status(500).send("Error fetching sales");
    res.render("sales", { sales: results, user: req.session.user });
  });
});

app.post("/add-product", requireAuth, (req, res) => {
  const { product_id, productname, unitprice, stockquantity } = req.body;
  const query =
    "INSERT INTO products (product_id, productname, unitprice, stockquantity) VALUES (?, ?, ?, ?)";
  dbConnection.query(
    query,
    [product_id, productname, unitprice, stockquantity],
    (err) => {
      if (err) return res.status(500).send("Error adding product");
      res.redirect("/products");
    }
  );
});

app.post("/add-supplier", requireAuth, (req, res) => {
  const { SupplierID, SupplierName, PhoneNumber, Address } = req.body;
  const query =
    "INSERT INTO suppliers (SupplierID, SupplierName, PhoneNumber, Address) VALUES (?, ?, ?, ?)";
  dbConnection.query(
    query,
    [SupplierID, SupplierName, PhoneNumber, Address],
    (err) => {
      if (err) return res.status(500).send("Error adding supplier");
      res.redirect("/suppliers");
    }
  );
});

app.post("/add-customer", requireAuth, (req, res) => {
  const { customers_id, customer_name, contact, address } = req.body;
  const query =
    "INSERT INTO customers (customers_id, customer_name, contact, address) VALUES (?, ?, ?, ?)";
  dbConnection.query(
    query,
    [customers_id, customer_name, contact, address],
    (err) => {
      if (err) return res.status(500).send("Error adding customer");
      res.redirect("/customers");
    }
  );
});

app.post("/add-employee", requireAuth, (req, res) => {
  const { EmployeeID, FirstName, PhoneNumber, Position } = req.body;
  const query =
    "INSERT INTO employees (EmployeeID, FirstName, PhoneNumber, Position) VALUES (?, ?, ?, ?)";
  dbConnection.query(
    query,
    [EmployeeID, FirstName, PhoneNumber, Position],
    (err) => {
      if (err) return res.status(500).send("Error adding employee");
      res.redirect("/employees");
    }
  );
});

app.post("/add-sale", requireAuth, (req, res) => {
  const { salesid, salesdate, quantitysold, product_id, customers_id } =
    req.body;
  const query =
    "INSERT INTO sales (salesid, salesdate, quantitysold, product_id, customers_id) VALUES (?, ?, ?, ?, ?)";
  dbConnection.query(
    query,
    [salesid, salesdate, quantitysold, product_id, customers_id],
    (err) => {
      if (err) return res.status(500).send("Error adding sale");
      res.redirect("/sales");
    }
  );
});

app.use((req, res) => {
  res.status(404).render("404");
});

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});